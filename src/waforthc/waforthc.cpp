#include <algorithm>
#include <cstring>
#include <filesystem>
#include <fstream>
#include <iostream>
#include <string>

#include <boost/algorithm/string/predicate.hpp>
#include <boost/process.hpp>
#include <boost/program_options.hpp>
#include <wabt/apply-names.h>
#include <wabt/binary-reader-ir.h>
#include <wabt/binary-reader.h>
#include <wabt/binary-writer.h>
#include <wabt/c-writer.h>
#include <wabt/error-formatter.h>
#include <wabt/generate-names.h>
#include <wabt/interp/binary-reader-interp.h>
#include <wabt/interp/interp-util.h>
#include <wabt/interp/interp.h>
#include <wabt/ir.h>
#include <wabt/resolve-names.h>
#include <wabt/stream.h>
#include <wabt/validator.h>

#include "waforth_core.h"
#include "waforth_rt.h"

// Passed by compiler command line. Defaults for IntelliSense
#ifndef WABT_WASM_RT_IMPL_INCLUDE_DIR
#define WABT_WASM_RT_IMPL_INCLUDE_DIR ""
#endif
#ifndef WABT_WASM_RT_IMPL_LIB_DIR
#define WABT_WASM_RT_IMPL_LIB_DIR ""
#endif

namespace bp = boost::process;
namespace bpo = boost::program_options;
namespace fs = std::filesystem;
namespace wabti = wabt::interp;

using defer = std::shared_ptr<void>;

static wabt::Features features;
static std::unique_ptr<wabt::FileStream> stderrStream;

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////

/**
 * Compiles a WASM module to a native file named `outfile`.
 */
wabt::Result compileToNative(wabt::Module &mod, const std::string &init, const std::string &outfile) {
  CHECK_RESULT(GenerateNames(&mod));
  CHECK_RESULT(ApplyNames(&mod));
  // CHECK_RESULT(wabt::ResolveNamesModule(&mod, &errors));

  defer _(nullptr, [](...) {
    fs::remove("_waforth_rt.c");
    fs::remove("_waforth_config.h");
    fs::remove("_waforth.c");
    fs::remove("_waforth.h");
  });

  {
    std::ofstream inith("_waforth_config.h");
    inith << "static uint8_t waforth_init[] = {";
    for (int i = 0; i < init.size(); ++i) {
      inith << (int)init[i];
      if (i != init.size() - 1) {
        inith << ",";
      }
    }
    inith << "};" << std::endl;
  }

  {
    wabt::WriteCOptions wcopt;
    wcopt.module_name = "waforth";
    wabt::FileStream c_stream("_waforth.c");
    wabt::FileStream h_stream("_waforth.h");
    CHECK_RESULT(WriteC(&c_stream, &h_stream, "_waforth.h", &mod, wcopt));
    wabt::FileStream rt_stream("_waforth_rt.c");
    rt_stream.WriteData(waforth_rt, sizeof(waforth_rt));
  }

  // std::cout << "gcc"
  //           << " -o " << outfile << " -I" WABT_WASM_RT_IMPL_INCLUDE_DIR << " _waforth_rt.c _waforth.c -L" WABT_WASM_RT_IMPL_LIB_DIR "
  //           -lwasm-rt-impl"
  //           << std::endl;
  bp::child c(bp::search_path("gcc"), "-o", outfile, "-I" WABT_WASM_RT_IMPL_INCLUDE_DIR, "_waforth_rt.c", "_waforth.c",
              "-L" WABT_WASM_RT_IMPL_LIB_DIR, "-lwasm-rt-impl");
  c.wait();
  int result = c.exit_code();
  if (result != 0) {
    std::cerr << "error compiling";
    return wabt::Result::Error;
  }

  return wabt::Result::Ok;
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////

wabt::Result readModule(const std::string &filename, const void *data, size_t size, wabt::Module &mod, wabt::Errors &errors) {
  CHECK_RESULT(ReadBinaryIr(filename.c_str(), data, size, wabt::ReadBinaryOptions(features, nullptr, true, true, true), &errors, &mod));
  CHECK_RESULT(ValidateModule(&mod, &errors, wabt::ValidateOptions(features)));
  return wabt::Result::Ok;
}

wabt::Result writeModule(const std::string &filename, const wabt::Module &mod) {
  wabt::MemoryStream out(nullptr);
  CHECK_RESULT(wabt::WriteBinaryModule(&out, &mod, wabt::WriteBinaryOptions(features, false, false, true)));
  return out.WriteToFile(filename);
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////

#define ERR_UNKNOWN 0x1
#define ERR_QUIT 0x2
#define ERR_ABORT 0x3
#define ERR_EOI 0x4
#define ERR_BYE 0x5

// FIXME: This is unsafe. Need a better way to extract this (e.g. through symbols)
#define LATEST_GLOBAL_INDEX 5
#define HERE_GLOBAL_INDEX 6

static wabti::Store store;

typedef std::vector<uint8_t> RawModule;

struct RunResult {
  std::vector<RawModule> modules;
  std::vector<uint8_t> data;
  wabti::u32 dataOffset;
  wabti::u32 latest;
  bool success;
};

wabt::Result run(const std::vector<uint8_t> &input, RunResult &result, wabt::Errors &errors) {
  // Load core module
  wabti::ModuleDesc desc;
  CHECK_RESULT(wabti::ReadBinaryInterp("waforth.wasm", waforth_core, sizeof(waforth_core),
                                       wabt::ReadBinaryOptions(features, nullptr, true, true, true), &errors, &desc));
  auto core = wabti::Module::New(store, desc);

  // Core Exports
  wabti::Func::Ptr errorFn;
  wabti::Func::Ptr runFn;
  wabti::Memory::Ptr memory;
  wabti::Table::Ptr table;

  // Input
  size_t inputOffset = 0;

  // Bind core imports
  wabti::RefVec imports;
  for (auto &&import : core->desc().imports) {
    if (import.type.type->kind == wabti::ExternKind::Func && import.type.module == "shell") {
      auto ft = *wabt::cast<wabti::FuncType>(import.type.type.get());
      auto fn = [&](wabti::Thread &thread, const wabti::Values &params, wabti::Values &results, wabti::Trap::Ptr *trap) -> wabt::Result {
        if (import.type.name == "read") {
          auto addr = params[0].Get<wabti::s32>();
          auto size = params[1].Get<wabti::s32>();
          int n, nend;
          for (n = 0, nend = std::min((size_t)size, input.size() - inputOffset); n < nend; ++n) {
            if (input[inputOffset + n] == '\n') {
              n += 1;
              break;
            }
          }
          std::memcpy(memory->UnsafeData() + addr, &input[inputOffset], n);
          inputOffset += n;
          results[0].Set((wabti::s32)n);
          return wabt::Result::Ok;
        } else if (import.type.name == "emit") {
          putchar(params[0].Get<wabti::s32>());
          return wabt::Result::Ok;
        } else if (import.type.name == "load") {
          auto addr = params[0].Get<wabti::s32>();
          auto size = params[1].Get<wabti::s32>();
          result.modules.push_back(std::vector<uint8_t>((uint8_t *)(memory->UnsafeData() + addr), (uint8_t *)(memory->UnsafeData() + addr + size)));

          wabti::ModuleDesc desc;
          CHECK_RESULT(wabti::ReadBinaryInterp("word.wasm", memory->UnsafeData() + addr, size,
                                               wabt::ReadBinaryOptions(features, nullptr, true, true, true), &errors, &desc));
          auto mod = wabti::Module::New(store, desc);
          wabti::RefVec imports = {table.ref(), memory.ref()};
          auto modi = wabti::Instance::Instantiate(store, mod.ref(), imports, trap);
          if (!modi) {
            std::cerr << "error instantiating word module" << std::endl;
            return wabt::Result::Error;
            ;
          }
          return wabt::Result::Ok;
        } else {
          std::cerr << "`" << import.type.name << "` is not implemented" << std::endl;
          return wabt::Result::Error;
        }
      };
      auto func = wabti::HostFunc::New(store, ft, fn);
      imports.push_back(func.ref());
      continue;
    }
    imports.push_back(wabti::Ref::Null);
  }

  // Instantiate module
  wabti::Trap::Ptr trap;
  auto corei = wabti::Instance::Instantiate(store, core.ref(), imports, &trap);
  if (!corei) {
    std::cerr << "error instantiating module" << std::endl;
    if (trap) {
      wabti::WriteTrap(stderrStream.get(), " error ", trap);
    }
    return wabt::Result::Error;
  }

  // Load exports
  for (auto &&export_ : core->desc().exports) {
    if (export_.type.type->kind == wabt::ExternalKind::Memory) {
      memory = store.UnsafeGet<wabti::Memory>(corei->memories()[export_.index]);
    } else if (export_.type.type->kind == wabt::ExternalKind::Table) {
      table = store.UnsafeGet<wabti::Table>(corei->tables()[export_.index]);
    } else if (export_.type.name == "run") {
      runFn = store.UnsafeGet<wabti::Func>(corei->funcs()[export_.index]);
    } else if (export_.type.name == "error") {
      errorFn = store.UnsafeGet<wabti::Func>(corei->funcs()[export_.index]);
    }
  }

  // Dictionary pointer
  auto here = store.UnsafeGet<wabti::Global>(corei->globals()[HERE_GLOBAL_INDEX]);
  auto initialHere = here->Get().Get<wabti::u32>();

  // Run
  wabti::Values runParams = {wabti::Value::Make(1)};
  wabti::Values runResults;
  wabti::Values errorParams;
  wabti::Values errorResults;
  for (int stopped = false; !stopped;) {
    auto runRes = runFn->Call(store, runParams, runResults, &trap, nullptr);
    CHECK_RESULT(errorFn->Call(store, errorParams, errorResults, &trap, nullptr));
    switch (errorResults[0].Get<wabti::s32>()) {
    case ERR_QUIT:
    case ERR_ABORT:
      assert(!Succeeded(runRes));
      break;
    case ERR_EOI:
      assert(Succeeded(runRes));
      stopped = true;
      break;
    case ERR_BYE:
      assert(!Succeeded(runRes));
      stopped = true;
      break;
    case ERR_UNKNOWN:
      assert(!Succeeded(runRes));
      if (trap) {
        wabti::WriteTrap(stderrStream.get(), " error ", trap);
      } else {
        std::cerr << "unknown error" << std::endl;
      }
      break;
    default:
      std::cerr << "unknown error code" << std::endl;
      if (trap) {
        wabti::WriteTrap(stderrStream.get(), " error ", trap);
      }
      assert(false);
    }
  }

  result.data =
      std::vector<uint8_t>((uint8_t *)(memory->UnsafeData() + initialHere), (uint8_t *)(memory->UnsafeData() + here->Get().Get<wabti::s32>()));
  result.dataOffset = initialHere;
  result.latest = store.UnsafeGet<wabti::Global>(corei->globals()[LATEST_GLOBAL_INDEX])->Get().Get<wabti::s32>();
  result.success = true;
  return wabt::Result::Ok;
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////

wabt::Result compileToModule(std::vector<wabt::Module> &words, const std::vector<uint8_t> &data, wabti::u32 dataOffset, wabti::u32 latest,
                             wabt::Module &compiled, wabt::Errors &errors) {
  CHECK_RESULT(readModule("waforth.wasm", waforth_core, sizeof(waforth_core), compiled, errors));

  auto dsf = wabt::MakeUnique<wabt::DataSegmentModuleField>();
  wabt::DataSegment &ds = dsf->data_segment;
  ds.memory_var = wabt::Var(0, wabt::Location());
  ds.offset.push_back(MakeUnique<wabt::ConstExpr>(wabt::Const::I32(dataOffset)));
  ds.data = data;
  compiled.AppendField(std::move(dsf));

  compiled.globals[HERE_GLOBAL_INDEX]->init_expr = wabt::ExprList{MakeUnique<wabt::ConstExpr>(wabt::Const::I32(dataOffset + data.size()))};
  compiled.globals[LATEST_GLOBAL_INDEX]->init_expr = wabt::ExprList{MakeUnique<wabt::ConstExpr>(wabt::Const::I32(latest))};

  for (auto &word : words) {
    assert(word.funcs.size() == 1);
    // compiled.funcs.push_back(word.funcs[0]);

    auto ff = wabt::MakeUnique<wabt::FuncModuleField>();
    auto &f = ff->func;
    f.name = word.funcs[0]->name;
    f.decl = word.funcs[0]->decl;
    f.local_types = word.funcs[0]->local_types;
    f.bindings = word.funcs[0]->bindings;
    f.exprs.splice(f.exprs.end(), word.funcs[0]->exprs);
    compiled.AppendField(std::move(ff));

    assert(word.elem_segments.size() == 1);
    auto elem = word.elem_segments[0];
    auto esf = wabt::MakeUnique<wabt::ElemSegmentModuleField>();
    wabt::ElemSegment &es = esf->elem_segment;
    es.kind = elem->kind;
    es.name = elem->name;
    es.table_var = elem->table_var;
    es.elem_type = elem->elem_type;
    assert(elem->elem_type = wabt::Type::FuncRef);
    es.offset = std::move(elem->offset);
    es.elem_exprs.push_back(wabt::ExprList{wabt::MakeUnique<wabt::RefFuncExpr>(wabt::Var(compiled.funcs.size() - 1, wabt::Location()))});
    compiled.AppendField(std::move(esf));
  }

  compiled.tables[0]->elem_limits.initial += words.size();

  return wabt::Result::Ok;
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////

wabt::Result main_(const std::string &infile, const std::string &outfile, const std::string &init, wabt::Errors &errors) {
  stderrStream = wabt::FileStream::CreateStderr();

  std::vector<uint8_t> in;
  CHECK_RESULT(wabt::ReadFile(infile, &in));

  RunResult rresult;
  CHECK_RESULT(run(in, rresult, errors));

  std::vector<wabt::Module> words;
  for (auto rmod : rresult.modules) {
    wabt::Module mod;
    CHECK_RESULT(readModule("word.wasm", &rmod[0], rmod.size(), mod, errors));
    words.push_back(std::move(mod));
  }

  wabt::Module compiled;
  CHECK_RESULT(compileToModule(words, rresult.data, rresult.dataOffset, rresult.latest, compiled, errors));

  if (boost::ends_with(outfile, ".wasm")) {
    CHECK_RESULT(writeModule(outfile, compiled));
  } else {
    CHECK_RESULT(compileToNative(compiled, init, outfile));
  }

  return wabt::Result::Ok;
}

int main(int argc, char *argv[]) {
  std::string outfile;
  std::string infile;
  std::string init;

  bpo::options_description desc("Options");
  desc.add_options()("help", "Show this help message")(
      "output,o", bpo::value<std::string>(&outfile)->default_value("out"),
      "Output file\nIf `arg` ends with .wasm, the result will be a WebAssembly module. Otherwise, the result will be a native executable.")(
      "init", bpo::value<std::string>(&init),
      "Initialization program\nIf specified, PROGRAM will be executed when the resulting executable is run. Otherwise, the resulting executable will "
      "start an interactive session.")("input", bpo::value<std::string>(&infile)->required(), "Input file");
  bpo::positional_options_description p;
  p.add("input", 1);
  bpo::variables_map vm;
  bpo::store(bpo::command_line_parser(argc, argv).options(desc).positional(p).run(), vm);
  if (vm.count("help")) {
    std::cout << desc << "\n";
    return 0;
  }
  try {
    bpo::notify(vm);
  } catch (const bpo::error &e) {
    std::cout << e.what();
    return -1;
  }

  wabt::Errors errors;
  if (!Succeeded(main_(infile, outfile, init, errors))) {
    FormatErrorsToFile(errors, wabt::Location::Type::Binary);
    return -1;
  }
  return 0;
}