import WAForth, { withCharacterBuffer, withLineBuffer } from "../waforth";
import sieve from "../../examples/sieve.f";
import forth2012TestSuiteTester from "./forth2012-test-suite/tester.fr";
import forth2012TestSuiteUtilities from "./forth2012-test-suite/utilities.fth";
import forth2012CoreTestSuite from "./forth2012-test-suite/core.fr";
import forth2012CorePlusTestSuite from "./forth2012-test-suite/coreplustest.fth";
// import forth2012ErrorReport from "./forth2012-test-suite/errorreport.fth";
import forth2012PreliminaryTestSuite from "./forth2012-test-suite/prelimtest.fth";
import forth2012CoreExtTestSuite from "./forth2012-test-suite/coreexttest.fth";

import { expect, assert } from "chai";

function loadTests() {
  describe("WAForth", () => {
    let forth, output, core, memory, memory8, initialTOS;

    beforeEach(() => {
      forth = new WAForth();
      forth.onEmit = withCharacterBuffer((c) => {
        output = output + c;
        // console.log(output);
      });
      let k = 0;
      const keyString =
        "abcdefghijklmnopqrstuvwxyz1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZ";
      forth.key = () => {
        const c = keyString.charCodeAt(k);
        k = (k + 1) % keyString.length;
        return c;
      };
      const x = forth.load().then(
        () => {
          core = forth.core.exports;

          output = "";
          memory = new Int32Array(core.memory.buffer, 0, 0x30000);
          memory8 = new Uint8Array(core.memory.buffer, 0, 0x30000);
          // dictionary = new Uint8Array(core.memory.buffer, 0x1000, 0x1000);
          initialTOS = core.tos();
        },
        (err) => {
          console.error(err);
        }
      );
      return x;
    });

    // eslint-disable-next-line no-unused-vars, @typescript-eslint/no-unused-vars
    function dumpTable() {
      for (let i = 0; i < core.table.length; ++i) {
        console.log("table", i, core.table.get(i));
      }
    }

    function getString(p, n) {
      let name = [];
      for (let i = 0; i < n; ++i) {
        name.push(String.fromCharCode(memory8[p + i]));
      }
      return name.join("");
    }

    // function getCountedString(p) {
    //   return getString(p + 4, memory[p / 4]);
    // }

    function loadString(s) {
      run("HERE");
      run(`${s.length} C,`);
      for (let i = 0; i < s.length; ++i) {
        run(`${s.charCodeAt(i)} C,`);
      }
    }

    // eslint-disable-next-line no-unused-vars, @typescript-eslint/no-unused-vars
    function dumpWord(w) {
      let end = here();
      let p = latest();
      while (p != w) {
        console.log("SEARCH", p, w);
        end = p;
        p = memory[p / 4];
      }
      const previous = memory[p / 4];
      const length = memory8[p + 4];
      const name = getString(p + 4 + 1, length);
      const codeP = (p + 4 + 1 + length + 3) & ~3;
      const code = memory[codeP / 4];
      const data = [];
      for (let i = codeP + 4; i < end; ++i) {
        data.push(memory8[i]);
      }
      console.log("Entry:", p, previous, length, name, code, data, end);
    }

    function run(s, expectErrors = false) {
      forth.interpret(s, true);
      const r = forth.core.exports.error();
      if (expectErrors) {
        expect(r).to.not.eql(4);
      } else {
        expect(r).to.eql(
          4,
          "Error " + r + " running: " + s + "; Output: " + output
        );
      }
    }

    function here() {
      run("HERE");
      const result = memory[core.tos() / 4 - 1];
      run("DROP");
      return result;
    }

    function latest() {
      run("LATEST");
      const result = memory[core.tos() / 4 - 1];
      run("DROP");
      return result;
    }

    function tosValue() {
      return memory[core.tos() / 4 - 1];
    }

    function stackValues() {
      const result = [];
      const tos = core.tos();
      for (let i = initialTOS; i < tos; i += 4) {
        result.push(memory[i / 4]);
      }
      return result;
    }

    describe("leb128", () => {
      it("should convert 0x0", () => {
        const r = core.leb128(0x0, 0x0);
        expect(r).to.eql(0x1);
        expect(memory8[0]).to.eql(0x0);
      });
      it("should convert 0x17", () => {
        const r = core.leb128(0x0, 0x17);
        expect(r).to.eql(0x1);
        expect(memory8[0]).to.eql(0x17);
      });
      it("should convert 0x80", () => {
        const r = core.leb128(0x0, 0x80);
        expect(r).to.eql(0x2);
        expect(memory8[0]).to.eql(0x80);
        expect(memory8[1]).to.eql(0x01);
      });
      it("should convert 0x12345", () => {
        const r = core.leb128(0x0, 0x12345);
        expect(r).to.eql(0x3);
        expect(memory8[0]).to.eql(0xc5);
        expect(memory8[1]).to.eql(0xc6);
        expect(memory8[2]).to.eql(0x04);
      });
      it("should convert -1", () => {
        const r = core.leb128(0x0, -1);
        expect(r).to.eql(0x1);
        expect(memory8[0]).to.eql(0x7f);
      });
      it("should convert -0x12345", () => {
        const r = core.leb128(0x0, -0x12345);
        expect(r).to.eql(0x3);
        expect(memory8[0]).to.eql(0xbb);
        expect(memory8[1]).to.eql(0xb9);
        expect(memory8[2]).to.eql(0x7b);
      });
    });

    describe("leb128u", () => {
      it("should convert 0x0", () => {
        const r = core.leb128u(0x0, 0x0);
        expect(r).to.eql(0x1);
        expect(memory8[0]).to.eql(0x0);
      });
      it("should convert 0x17", () => {
        const r = core.leb128u(0x0, 0x17);
        expect(r).to.eql(0x1);
        expect(memory8[0]).to.eql(0x17);
      });
      it("should convert 0x73", () => {
        const r = core.leb128u(0x0, 0x73);
        expect(r).to.eql(0x1);
        expect(memory8[0]).to.eql(0x73);
      });
      it("should convert 0x80", () => {
        const r = core.leb128u(0x0, 0x80);
        expect(r).to.eql(0x2);
        expect(memory8[0]).to.eql(0x80);
        expect(memory8[1]).to.eql(0x01);
      });
      it("should convert 0x12345", () => {
        const r = core.leb128(0x0, 0x12345);
        expect(r).to.eql(0x3);
        expect(memory8[0]).to.eql(0xc5);
        expect(memory8[1]).to.eql(0xc6);
        expect(memory8[2]).to.eql(0x04);
      });
    });

    describe("leb128-4p", () => {
      it("should convert 0x0", () => {
        expect(core.leb128_4p(0x0)).to.eql(0x808080);
      });
      it("should convert 0x17", () => {
        expect(core.leb128_4p(0x17)).to.eql(0x808097);
      });
      it("should convert 0x80", () => {
        expect(core.leb128_4p(0x80)).to.eql(0x808180);
      });
      it("should convert 0xBADF00D", () => {
        expect(core.leb128_4p(0xbadf00d)).to.eql(0x5db7e08d);
      });
      it("should convert 0xFFFFFFF", () => {
        expect(core.leb128_4p(0xfffffff)).to.eql(0x7fffffff);
      });
    });

    describe("interpret", () => {
      it("should return an error when word is not found", () => {
        forth.read("BADWORD");
        expect(() => core.run()).to.throw();
        expect(output.trim()).to.eql("undefined word: BADWORD");
      });

      it("should write the ok prompt when interpreting", () => {
        forth.read("1 2");
        core.run();
        expect(output.trim()).to.eql("ok");
      });

      it("should write the compiled prompt when compiling", () => {
        forth.read(": foo 1 2");
        core.run();
        expect(output.trim()).to.eql("compiled");
      });

      it("should interpret a positive number", () => {
        forth.read("123");
        core.run();
        expect(core.error()).to.eql(4);
        expect(stackValues()[0]).to.eql(123);
      });

      it("should interpret a negative number", () => {
        forth.read("-123");
        core.run();
        expect(core.error()).to.eql(4);
        expect(stackValues()[0]).to.eql(-123);
      });
      it("should interpret a hex", () => {
        forth.read("16 BASE ! DF");
        core.run();
        expect(core.error()).to.eql(4);
        expect(stackValues()[0]).to.eql(223);
      });
      it("should not interpret hex in decimal mode", () => {
        forth.read("DF");
        expect(() => core.run()).to.throw();
        expect(output.trim()).to.eql("undefined word: DF");
      });

      it("should fail on half a word", () => {
        forth.read("23FOO");
        expect(() => core.run()).to.throw();
        expect(output.trim()).to.eql("undefined word: 23FOO");
      });

      it("should interpret a long string", () => {
        const p = ["1"];
        for (let i = 0; i < 1000; i++) {
          p.push(`${1} +`);
        }
        forth.interpret(p.join("\n"));
        expect(stackValues()).to.eql([1001]);
      });
    });

    describe("DUP", () => {
      it("should work", () => {
        run("121");
        run("DUP");
        expect(stackValues()[0]).to.eql(121);
        expect(stackValues()[1]).to.eql(121);
      });
    });

    describe("?DUP", () => {
      it("should duplicate when not 0", () => {
        run("121");
        run("?DUP 5");
        expect(stackValues()[0]).to.eql(121);
        expect(stackValues()[1]).to.eql(121);
        expect(stackValues()[2]).to.eql(5);
      });

      it("should not duplicate when 0", () => {
        run("0");
        run("?DUP 5");
        expect(stackValues()[0]).to.eql(0);
        expect(stackValues()[1]).to.eql(5);
      });
    });

    describe("2DUP", () => {
      it("should work", () => {
        run("222");
        run("173");
        run("2DUP");
        run("5");
        expect(stackValues()[0]).to.eql(222);
        expect(stackValues()[1]).to.eql(173);
        expect(stackValues()[2]).to.eql(222);
        expect(stackValues()[3]).to.eql(173);
        expect(stackValues()[4]).to.eql(5);
      });
    });

    describe("ROT", () => {
      it("should work", () => {
        run("1 2 3 ROT 5");
        expect(stackValues()[0]).to.eql(2);
        expect(stackValues()[1]).to.eql(3);
        expect(stackValues()[2]).to.eql(1);
        expect(stackValues()[3]).to.eql(5);
      });
    });

    describe("MIN", () => {
      it("should min (1)", () => {
        run("3 7 MIN 5");
        expect(stackValues()[0]).to.eql(3);
        expect(stackValues()[1]).to.eql(5);
      });

      it("should min (1)", () => {
        run("7 3 MIN 5");
        expect(stackValues()[0]).to.eql(3);
        expect(stackValues()[1]).to.eql(5);
      });
    });

    describe("MAX", () => {
      it("should min (1)", () => {
        run("3 7 MAX 5");
        expect(stackValues()[0]).to.eql(7);
        expect(stackValues()[1]).to.eql(5);
      });

      it("should min (1)", () => {
        run("7 3 MAX 5");
        expect(stackValues()[0]).to.eql(7);
        expect(stackValues()[1]).to.eql(5);
      });
    });

    describe("*", () => {
      it("should multiply", () => {
        run("3");
        run("4");
        run("*");
        run("5");
        expect(stackValues()[0]).to.eql(12);
        expect(stackValues()[1]).to.eql(5);
      });

      it("should multiply negative", () => {
        run("-3");
        run("4");
        run("*");
        run("5");
        expect(stackValues()[0]).to.eql(-12);
        expect(stackValues()[1]).to.eql(5);
      });
    });

    describe("+", () => {
      it("should add", () => {
        run("3");
        run("4");
        run("+");
        run("5");
        expect(stackValues()[0]).to.eql(7);
        expect(stackValues()[1]).to.eql(5);
      });
    });

    describe("-", () => {
      it("should subtract", () => {
        run("8 5 - 5");
        expect(stackValues()[0]).to.eql(3);
        expect(stackValues()[1]).to.eql(5);
      });

      it("should subtract to negative", () => {
        run("8 13 - 5");
        expect(stackValues()[0]).to.eql(-5);
        expect(stackValues()[1]).to.eql(5);
      });

      it("should subtract negative", () => {
        run("8 -3 - 5");
        expect(stackValues()[0]).to.eql(11);
        expect(stackValues()[1]).to.eql(5);
      });
    });

    describe("/", () => {
      it("should divide", () => {
        run("15 5 / 5");
        expect(stackValues()[0]).to.eql(3);
        expect(stackValues()[1]).to.eql(5);
      });

      it("should divide negative", () => {
        run("15 -5 / 5");
        expect(stackValues()[0]).to.eql(-3);
        expect(stackValues()[1]).to.eql(5);
      });
    });

    describe("/MOD", () => {
      it("should work", () => {
        run("15 6 /MOD 5");
        expect(stackValues()[0]).to.eql(3);
        expect(stackValues()[1]).to.eql(2);
        expect(stackValues()[2]).to.eql(5);
      });
    });

    describe("FM/MOD", () => {
      it("should work", () => {
        run("7 S>D 3 FM/MOD");
        expect(stackValues()).to.eql([1, 2]);
      });

      it("should work with negative divisor", () => {
        run("7 S>D -3 FM/MOD");
        expect(stackValues()).to.eql([-2, -3]);
      });

      it("should work with large dividend", () => {
        run("0 INVERT 1 4 FM/MOD");
        expect(stackValues()).to.eql([3, 2147483647]);
      });
    });

    describe("UM/MOD", () => {
      it("should work", () => {
        run("1 0 2 UM/MOD");
        expect(stackValues()).to.eql([1, 0]);
      });
    });

    describe("*/", () => {
      it("should work with small numbers", () => {
        run("10 3 5 */ 5");
        expect(stackValues()[0]).to.eql(6);
        expect(stackValues()[1]).to.eql(5);
      });

      it("should work with large numbers", () => {
        run("268435455 1000 5000 */");
        expect(stackValues()[0]).to.eql(53687091);
      });
    });

    describe("*/MOD", () => {
      it("should work with small numbers", () => {
        run("9 3 5 */MOD 7");
        expect(stackValues()[0]).to.eql(2);
        expect(stackValues()[1]).to.eql(5);
        expect(stackValues()[2]).to.eql(7);
      });

      it("should work with large numbers", () => {
        run("268435455 1000 3333 */MOD");
        expect(stackValues()[0]).to.eql(1230);
        expect(stackValues()[1]).to.eql(80538690);
      });
    });

    describe("1+", () => {
      it("should work with positive numbers", () => {
        run("3");
        run("1+");
        run("5");
        expect(stackValues()[0]).to.eql(4);
        expect(stackValues()[1]).to.eql(5);
      });

      it("should work with negative numbers", () => {
        run("-3");
        run("1+");
        run("5");
        expect(stackValues()[0]).to.eql(-2);
        expect(stackValues()[1]).to.eql(5);
      });
    });

    describe("1-", () => {
      it("should work with positive numbers", () => {
        run("3");
        run("1-");
        run("5");
        expect(stackValues()[0]).to.eql(2);
        expect(stackValues()[1]).to.eql(5);
      });

      it("should work with negative numbers", () => {
        run("-3");
        run("1-");
        run("5");
        expect(stackValues()[0]).to.eql(-4);
        expect(stackValues()[1]).to.eql(5);
      });
    });

    describe(">", () => {
      it("should test true when greater", () => {
        run("5");
        run("3");
        run(">");
        run("5");
        expect(stackValues()[0]).to.eql(-1);
        expect(stackValues()[1]).to.eql(5);
      });

      it("should test false when smaller", () => {
        run("3");
        run("5");
        run(">");
        run("5");
        expect(stackValues()[0]).to.eql(0);
        expect(stackValues()[1]).to.eql(5);
      });

      it("should test false when equal", () => {
        run("5");
        run("5");
        run(">");
        run("5");
        expect(stackValues()[0]).to.eql(0);
        expect(stackValues()[1]).to.eql(5);
      });

      it("should work with negative numbers", () => {
        run("5");
        run("-3");
        run(">");
        run("5");
        expect(stackValues()[0]).to.eql(-1);
        expect(stackValues()[1]).to.eql(5);
      });
    });

    describe("NEGATE", () => {
      it("should negate positive number", () => {
        run("7 NEGATE 5");
        expect(stackValues()[0]).to.eql(-7);
        expect(stackValues()[1]).to.eql(5);
      });

      it("should negate negative number", () => {
        run("-7 NEGATE 5");
        expect(stackValues()[0]).to.eql(7);
        expect(stackValues()[1]).to.eql(5);
      });

      it("should negate negative zero", () => {
        run("0 NEGATE 5");
        expect(stackValues()[0]).to.eql(0);
        expect(stackValues()[1]).to.eql(5);
      });
    });

    describe("0=", () => {
      it("should test true", () => {
        run("0");
        run("0=");
        run("5");
        expect(stackValues()[0]).to.eql(-1);
        expect(stackValues()[1]).to.eql(5);
      });

      it("should test false", () => {
        run("23");
        run("0=");
        run("5");
        expect(stackValues()[0]).to.eql(0);
        expect(stackValues()[1]).to.eql(5);
      });
    });

    describe("0>", () => {
      it("should test true", () => {
        run("2");
        run("0>");
        run("5");
        expect(stackValues()[0]).to.eql(-1);
        expect(stackValues()[1]).to.eql(5);
      });

      it("should test false", () => {
        run("-3");
        run("0>");
        run("5");
        expect(stackValues()[0]).to.eql(0);
        expect(stackValues()[1]).to.eql(5);
      });
    });

    describe("OVER", () => {
      it("should work", () => {
        run("12");
        run("34");
        run("OVER");
        run("5");
        expect(stackValues()[0]).to.eql(12);
        expect(stackValues()[1]).to.eql(34);
        expect(stackValues()[2]).to.eql(12);
        expect(stackValues()[3]).to.eql(5);
      });
    });

    describe("SWAP", () => {
      it("should work", () => {
        run("12");
        run("34");
        run("SWAP");
        run("5");
        expect(stackValues()[0]).to.eql(34);
        expect(stackValues()[1]).to.eql(12);
        expect(stackValues()[2]).to.eql(5);
      });
    });

    describe("EMIT", () => {
      it("should work once", () => {
        run("87");
        run("EMIT");
        expect(output).to.eql("W");
      });

      it("should work twice", () => {
        run("97");
        run("87");
        run("EMIT");
        run("EMIT");
        expect(output).to.eql("Wa");
      });
    });

    describe("DROP", () => {
      it("should drop", () => {
        run("222");
        run("173");
        run("DROP");
        run("190");
        expect(stackValues()[0]).to.eql(222);
        expect(stackValues()[1]).to.eql(190);
      });
    });

    describe("ERASE", () => {
      it("should erase", () => {
        const ptr = here();
        memory8[ptr] = 222;
        memory8[ptr + 1] = 173;
        memory8[ptr + 2] = 190;
        memory8[ptr + 3] = 239;
        run((ptr + 1).toString(10));
        run("2 ERASE 5");

        expect(memory8[ptr + 0]).to.eql(222);
        expect(memory8[ptr + 1]).to.eql(0x00);
        expect(memory8[ptr + 2]).to.eql(0x00);
        expect(memory8[ptr + 3]).to.eql(239);
        expect(stackValues()[0]).to.eql(5);
      });
    });

    describe("IF/ELSE/THEN", () => {
      it("should take the then branch without else", () => {
        run(`: FOO IF 8 THEN ;`);
        run("1 FOO 5");
        expect(stackValues()[0]).to.eql(8);
        expect(stackValues()[1]).to.eql(5);
      });

      it("should not take the then branch without else", () => {
        run(": FOO");
        run("IF");
        run("8");
        run("THEN");
        run("0");
        run(";");
        run("FOO");
        run("5");
        expect(stackValues()[0]).to.eql(5);
      });

      it("should take the then branch with else", () => {
        run(": FOO");
        run("IF");
        run("8");
        run("ELSE");
        run("9");
        run("THEN");
        run(";");
        run("1");
        run("FOO");
        run("5");
        expect(stackValues()[0]).to.eql(8);
        expect(stackValues()[1]).to.eql(5);
      });

      it("should take the else branch with else", () => {
        run(": FOO");
        run("IF");
        run("8");
        run("ELSE");
        run("9");
        run("THEN");
        run(";");
        run("0");
        run("FOO");
        run("5");
        expect(stackValues()[0]).to.eql(9);
        expect(stackValues()[1]).to.eql(5);
      });

      it("should support nested if", () => {
        run(`: FOO
              IF
                IF 8 ELSE 9 THEN
                10
              ELSE
                11
              THEN
              ;`);
        run("0 1 FOO 5");
        expect(stackValues()[0]).to.eql(9);
        expect(stackValues()[1]).to.eql(10);
        expect(stackValues()[2]).to.eql(5);
      });
    });

    describe("DO/LOOP", () => {
      it("should run a loop", () => {
        run(`: FOO 4 0 DO 3 LOOP ;`);
        run("FOO 5");
        expect(stackValues()[0]).to.eql(3);
        expect(stackValues()[1]).to.eql(3);
        expect(stackValues()[2]).to.eql(3);
        expect(stackValues()[3]).to.eql(3);
        expect(stackValues()[4]).to.eql(5);
      });

      it("should run a nested loop", () => {
        run(`: FOO 3 0 DO 2 0 DO 3 LOOP LOOP ;`);
        run("FOO 5");
        expect(stackValues()[0]).to.eql(3);
        expect(stackValues()[1]).to.eql(3);
        expect(stackValues()[2]).to.eql(3);
        expect(stackValues()[3]).to.eql(3);
        expect(stackValues()[4]).to.eql(3);
        expect(stackValues()[5]).to.eql(3);
        expect(stackValues()[6]).to.eql(5);
      });
    });

    describe("?DO/LOOP", () => {
      it("should run a loop", () => {
        run(`: FOO 4 0 ?DO 3 LOOP ;`);
        run("FOO");
        expect(stackValues()).to.eql([3, 3, 3, 3]);
      });

      it("should not run a loop with equal conditions", () => {
        run(`: FOO 4 4 ?DO 3 LOOP ;`);
        run("FOO");
        expect(stackValues()).to.eql([]);
      });
    });

    describe("UNLOOP", () => {
      it("should work with nested loops", () => {
        run(
          ": GD6 0 3 0 DO I 1+ 0 DO I J + 3 = IF I UNLOOP I UNLOOP EXIT THEN 1+ LOOP LOOP ;"
        );
        run("GD6");
        expect(stackValues()).to.eql([4, 1, 2]);
      });
    });

    describe("LEAVE", () => {
      it("should leave", () => {
        run(`: FOO 4 0 DO 3 LEAVE 6 LOOP 4 ;`);
        run("FOO 5");
        expect(stackValues()).to.eql([3, 4, 5]);
      });

      it("should leave an if in a loop", () => {
        run(`: FOO 5 0 DO I I 3 = IF 124 LEAVE THEN I LOOP 123 ;`);
        run("FOO 5");
        expect(stackValues()).to.eql([0, 0, 1, 1, 2, 2, 3, 124, 123, 5]);
      });
    });

    describe("+LOOP", () => {
      it("should increment a loop", () => {
        run(`: FOO 10 0 DO 3 2 +LOOP ;`);
        run("FOO 5");
        expect(stackValues()[0]).to.eql(3);
        expect(stackValues()[1]).to.eql(3);
        expect(stackValues()[2]).to.eql(3);
        expect(stackValues()[3]).to.eql(3);
        expect(stackValues()[4]).to.eql(3);
        expect(stackValues()[5]).to.eql(5);
      });

      it("should increment a loop beyond the index", () => {
        run(`: FOO 10 0 DO 3 8 +LOOP ;`);
        run("FOO 5");
        expect(stackValues()[0]).to.eql(3);
        expect(stackValues()[1]).to.eql(3);
        expect(stackValues()[2]).to.eql(5);
      });

      it("should work with decrementing loops", () => {
        run(": GD2 DO I -1 +LOOP ;");
        run("1 4 GD2");
        expect(stackValues()).to.eql([4, 3, 2, 1]);
      });
    });

    describe("I", () => {
      it("should work", () => {
        run(`: FOO 4 0 DO I LOOP ;`);
        run("FOO 5");
        expect(stackValues()[0]).to.eql(0);
        expect(stackValues()[1]).to.eql(1);
        expect(stackValues()[2]).to.eql(2);
        expect(stackValues()[3]).to.eql(3);
        expect(stackValues()[4]).to.eql(5);
      });

      it("should work in a nested loop", () => {
        run(`: FOO 3 0 DO 2 0 DO I LOOP LOOP ;`);
        run("FOO 5");
        expect(stackValues()[0]).to.eql(0);
        expect(stackValues()[1]).to.eql(1);
        expect(stackValues()[2]).to.eql(0);
        expect(stackValues()[3]).to.eql(1);
        expect(stackValues()[4]).to.eql(0);
        expect(stackValues()[5]).to.eql(1);
        expect(stackValues()[6]).to.eql(5);
      });
    });

    describe("J", () => {
      it("should work", () => {
        run(`: FOO 3 0 DO 2 0 DO J LOOP LOOP ;`);
        run("FOO 5");
        expect(stackValues()[0]).to.eql(0);
        expect(stackValues()[1]).to.eql(0);
        expect(stackValues()[2]).to.eql(1);
        expect(stackValues()[3]).to.eql(1);
        expect(stackValues()[4]).to.eql(2);
        expect(stackValues()[5]).to.eql(2);
        expect(stackValues()[6]).to.eql(5);
      });

      it("should work in a nested loop", () => {
        run(`: FOO 3 0 DO 2 0 DO J LOOP LOOP ;`);
        run("FOO 5");
        expect(stackValues()[0]).to.eql(0);
        expect(stackValues()[1]).to.eql(0);
        expect(stackValues()[2]).to.eql(1);
        expect(stackValues()[3]).to.eql(1);
        expect(stackValues()[4]).to.eql(2);
        expect(stackValues()[5]).to.eql(2);
        expect(stackValues()[6]).to.eql(5);
      });
    });

    describe("BEGIN / WHILE / REPEAT", () => {
      it("should work", () => {
        run(`: FOO BEGIN DUP 2 * DUP 16 < WHILE DUP REPEAT 7 ;`);
        run("1 FOO 5");
        expect(stackValues()[0]).to.eql(1);
        expect(stackValues()[1]).to.eql(2);
        expect(stackValues()[2]).to.eql(2);
        expect(stackValues()[3]).to.eql(4);
        expect(stackValues()[4]).to.eql(4);
        expect(stackValues()[5]).to.eql(8);
        expect(stackValues()[6]).to.eql(8);
        expect(stackValues()[7]).to.eql(16);
        expect(stackValues()[8]).to.eql(7);
        expect(stackValues()[9]).to.eql(5);
      });
    });

    describe("BEGIN / UNTIL", () => {
      it("should work", () => {
        run(`: FOO BEGIN DUP 2 * DUP 16 > UNTIL 7 ;`);
        run("1 FOO 5");
        expect(stackValues()[0]).to.eql(1);
        expect(stackValues()[1]).to.eql(2);
        expect(stackValues()[2]).to.eql(4);
        expect(stackValues()[3]).to.eql(8);
        expect(stackValues()[4]).to.eql(16);
        expect(stackValues()[5]).to.eql(32);
        expect(stackValues()[6]).to.eql(7);
        expect(stackValues()[7]).to.eql(5);
      });
    });

    describe("EXIT", () => {
      it("should work", () => {
        run(`: FOO IF 3 EXIT 4 THEN 5 ;`);
        run("1 FOO 6");
        expect(stackValues()[0]).to.eql(3);
        expect(stackValues()[1]).to.eql(6);
      });
    });

    describe("( / )", () => {
      it("should work", () => {
        run(": FOO ( bad -- x ) 7 ;");
        run("1 FOO 5");
        expect(stackValues()[0]).to.eql(1);
        expect(stackValues()[1]).to.eql(7);
        expect(stackValues()[2]).to.eql(5);
      });

      it("should ignore nesting", () => {
        run(": FOO ( ( bad -- x ) 7 ;");
        run("1 FOO 5");
        expect(stackValues()[0]).to.eql(1);
        expect(stackValues()[1]).to.eql(7);
        expect(stackValues()[2]).to.eql(5);
      });
    });

    describe("CHAR", () => {
      it("should work with a single character", () => {
        run("CHAR A 5");
        expect(stackValues()[0]).to.eql(65);
        expect(stackValues()[1]).to.eql(5);
      });

      it("should work with multiple characters", () => {
        run("CHAR ABC 5");
        expect(stackValues()[0]).to.eql(65);
        expect(stackValues()[1]).to.eql(5);
      });
    });

    describe("[CHAR]", () => {
      it("should work with a single character", () => {
        run(": FOO [CHAR] A 5 ;");
        run("4 FOO 6");
        expect(stackValues()[0]).to.eql(4);
        expect(stackValues()[1]).to.eql(65);
        expect(stackValues()[2]).to.eql(5);
        expect(stackValues()[3]).to.eql(6);
      });

      it("should work with multiple characters", () => {
        run(": FOO [CHAR] ABC 5 ;");
        run("4 FOO 6");
        expect(stackValues()[0]).to.eql(4);
        expect(stackValues()[1]).to.eql(65);
        expect(stackValues()[2]).to.eql(5);
        expect(stackValues()[3]).to.eql(6);
      });
    });

    // describe("word", () => {
    //   it("should read a word", () => {
    //     forth.read(" FOO BAR BAZ ");
    //     core.WORD();
    //     expect(getCountedString(stackValues()[0])).to.eql("FOO");
    //   });
    //
    //   it("should read two words", () => {
    //     forth.read(" FOO BAR BAZ ");
    //     core.WORD();
    //     core.WORD();
    //     expect(getCountedString(stackValues()[1])).to.eql("BAR");
    //   });
    //
    //   it("should skip comments", () => {
    //     forth.read("  \\ FOO BAZ\n BART BAZ");
    //     core.WORD();
    //     expect(getCountedString(stackValues()[0])).to.eql("BART");
    //   });
    //
    //   it("should stop at end of buffer while parsing word", () => {
    //     forth.read("FOO");
    //     core.WORD();
    //     expect(getCountedString(stackValues()[0])).to.eql("FOO");
    //   });
    //
    //   it("should stop at end of buffer while parsing comments", () => {
    //     forth.read(" \\FOO");
    //     core.WORD();
    //     expect(getCountedString()).to.eql("");
    //   });
    //
    //   it("should stop when parsing empty line", () => {
    //     forth.read(" ");
    //     core.WORD();
    //     expect(getCountedString()).to.eql("");
    //   });
    //
    //   it("should stop when parsing nothing", () => {
    //     forth.read("");
    //     core.WORD();
    //     expect(getCountedString()).to.eql("");
    //   });
    // });

    describe("FIND", () => {
      it.skip("should find a word", () => {
        loadString("DUP");
        run("FIND");
        expect(stackValues()[0]).to.eql(132216); // FIXME: Make test more robust against dict changes
        expect(stackValues()[1]).to.eql(-1);
      });

      it.skip("should find a short word", () => {
        loadString("!");
        run("FIND");
        expect(stackValues()[0]).to.eql(131220); // FIXME: Make test more robust against dict changes
        expect(stackValues()[1]).to.eql(-1);
      });

      it.skip("should find an immediate word", () => {
        loadString("+LOOP");
        run("FIND");
        expect(stackValues()[0]).to.eql(131356); // FIXME: Make test more robust against dict changes
        expect(stackValues()[1]).to.eql(1);
      });

      it("should not find an unexisting word", () => {
        loadString("BADWORD");
        run("FIND");
        expect(stackValues()[1]).to.eql(0);
      });

      it("should not find a very long unexisting word", () => {
        loadString("VERYVERYVERYBADWORD");
        run("FIND");
        expect(stackValues()[1]).to.eql(0);
      });
    });

    describe("BASE", () => {
      it("should contain the base", () => {
        run("BASE @ 5");
        expect(stackValues()[0]).to.eql(10);
        expect(stackValues()[1]).to.eql(5);
      });
    });

    // describe("KEY", () => {
    //   it("should read a key", () => {
    //     run("KEY F");
    //     run("5");
    //     expect(stackValues()[0]).to.eql(70);
    //     expect(stackValues()[1]).to.eql(5);
    //   });
    // });

    describe("LITERAL", () => {
      it("should put a literal on the stack", () => {
        run("20 : FOO LITERAL ;");
        run("5 FOO");
        expect(stackValues()[0]).to.eql(5);
        expect(stackValues()[1]).to.eql(20);
      });
    });

    describe("[ ]", () => {
      it("should work", () => {
        run(": FOO [ 20 5 * ] LITERAL ;");
        run("5 FOO 6");
        expect(stackValues()[0]).to.eql(5);
        expect(stackValues()[1]).to.eql(100);
        expect(stackValues()[2]).to.eql(6);
      });
    });

    describe("C@", () => {
      it("should fetch an aligned character", () => {
        const ptr = here();
        memory8[ptr] = 222;
        memory8[ptr + 1] = 173;
        run(ptr.toString());
        run("C@");
        expect(stackValues()[0]).to.eql(222);
      });

      it("should fetch an unaligned character", () => {
        const ptr = here();
        memory8[ptr] = 222;
        memory8[ptr + 1] = 173;
        run((ptr + 1).toString());
        run("C@");
        expect(stackValues()[0]).to.eql(173);
      });
    });

    describe("C!", () => {
      it("should store an aligned character", () => {
        const ptr = here();
        memory8[ptr] = 222;
        memory8[ptr + 1] = 173;
        run("190");
        run(ptr.toString());
        run("C! 5");
        expect(stackValues()[0]).to.eql(5);
        expect(memory8[ptr]).to.eql(190);
        expect(memory8[ptr + 1]).to.eql(173);
      });

      it("should store an unaligned character", () => {
        const ptr = here();
        memory8[ptr] = 222;
        memory8[ptr + 1] = 173;
        run("190");
        run((ptr + 1).toString());
        run("C! 5");
        expect(stackValues()[0]).to.eql(5);
        expect(memory8[ptr]).to.eql(222);
        expect(memory8[ptr + 1]).to.eql(190);
      });
    });

    describe("@", () => {
      it("should fetch", () => {
        const ptr = here();
        memory[ptr / 4] = 123456;
        run(ptr.toString());
        run("@ 5");
        expect(stackValues()[0]).to.eql(123456);
        expect(stackValues()[1]).to.eql(5);
      });
    });

    describe("!", () => {
      it("should store", () => {
        const ptr = here();
        run("12345");
        run(ptr.toString());
        run("! 5");
        expect(stackValues()[0]).to.eql(5);
        expect(memory[ptr / 4]).to.eql(12345);
      });
    });

    describe(",", () => {
      it("should add word", () => {
        run("HERE");
        run("1234");
        run(",");
        run("HERE");
        expect(stackValues()[1] - stackValues()[0]).to.eql(4);
        expect(memory[stackValues()[0] / 4]).to.eql(1234);
      });
    });

    describe('S"', () => {
      it("should work", () => {
        run(': FOO S" Foo Bar" ;');
        run("FOO");
        expect(stackValues()[1]).to.eql(7);
        expect(getString(stackValues()[0], stackValues()[1])).to.eql("Foo Bar");
      });

      it("should work with 2 strings", () => {
        run(': FOO S" Foo Bar" ;');
        run(': BAR S" Baz Ba" ;');
        run("FOO BAR 5");
        expect(stackValues()[1]).to.eql(7);
        expect(getString(stackValues()[0], stackValues()[1])).to.eql("Foo Bar");
        expect(stackValues()[3]).to.eql(6);
        expect(getString(stackValues()[2], stackValues()[3])).to.eql("Baz Ba");
      });
    });

    describe('S\\"', () => {
      it("should work", () => {
        run(': FOO S\\" Foo \\"\\n B\\x61r\\m" ;');
        run("FOO");
        expect(stackValues()[1]).to.eql(12);
        expect(getString(stackValues()[0], stackValues()[1])).to.eql(
          'Foo "\n Bar\r\n'
        );
      });

      it("should work with \\x", () => {
        run(': FOO S\\" \\x6F" ;');
        run("FOO");
        expect(stackValues()[1]).to.eql(1);
        expect(getString(stackValues()[0], stackValues()[1])).to.eql("o");
      });

      it("should work without escapes", () => {
        run(': FOO S\\" Foo Bar" ;');
        run("FOO");
        expect(stackValues()[1]).to.eql(7);
        expect(getString(stackValues()[0], stackValues()[1])).to.eql("Foo Bar");
      });
    });

    describe("TYPE", () => {
      it("should work", () => {
        run(': FOO S" Foo Bar" TYPE ;');
        run("FOO");
        expect(output).to.eql("Foo Bar");
      });
    });

    describe('."', () => {
      it("should work", () => {
        run(': FOO ." Foo Bar" ;');
        run("FOO 5");
        expect(stackValues()[0]).to.eql(5);
        expect(output).to.eql("Foo Bar");
      });
    });

    describe("MOVE", () => {
      it("should work with non-overlapping regions", () => {
        const ptr = here();
        memory8[ptr] = 1;
        memory8[ptr + 1] = 2;
        memory8[ptr + 2] = 3;
        memory8[ptr + 3] = 4;
        memory8[ptr + 4] = 5;
        run("HERE HERE 10 + 4 MOVE 5");

        expect(stackValues()[0]).to.eql(5);
        expect(memory8[ptr + 10]).to.eql(1);
        expect(memory8[ptr + 11]).to.eql(2);
        expect(memory8[ptr + 12]).to.eql(3);
        expect(memory8[ptr + 13]).to.eql(4);
        expect(memory8[ptr + 14]).to.eql(0);
      });

      it("should work with begin-overlapping regions", () => {
        const ptr = here();
        memory8[ptr] = 1;
        memory8[ptr + 1] = 2;
        memory8[ptr + 2] = 3;
        memory8[ptr + 3] = 4;
        memory8[ptr + 4] = 5;
        run("HERE HERE 2 + 4 MOVE 5");

        expect(stackValues()[0]).to.eql(5);
        expect(memory8[ptr + 0]).to.eql(1);
        expect(memory8[ptr + 1]).to.eql(2);
        expect(memory8[ptr + 2]).to.eql(1);
        expect(memory8[ptr + 3]).to.eql(2);
        expect(memory8[ptr + 4]).to.eql(3);
        expect(memory8[ptr + 5]).to.eql(4);
        expect(memory8[ptr + 6]).to.eql(0);
      });

      it("should work with end-overlapping regions", () => {
        const ptr = here();
        memory8[ptr + 10] = 1;
        memory8[ptr + 11] = 2;
        memory8[ptr + 12] = 3;
        memory8[ptr + 13] = 4;
        memory8[ptr + 14] = 5;
        run("HERE 10 + DUP 2 - 4 MOVE 5");

        expect(stackValues()[0]).to.eql(5);
        expect(memory8[ptr + 8]).to.eql(1);
        expect(memory8[ptr + 9]).to.eql(2);
        expect(memory8[ptr + 10]).to.eql(3);
        expect(memory8[ptr + 11]).to.eql(4);
        expect(memory8[ptr + 12]).to.eql(3);
        expect(memory8[ptr + 13]).to.eql(4);
        expect(memory8[ptr + 14]).to.eql(5);
      });
    });

    describe("RECURSE", () => {
      it("should recurse", () => {
        run(": FOO DUP 4 < IF DUP 1+ RECURSE ELSE 12 THEN 13 ;");
        run("1 FOO 5");
        expect(stackValues()[0]).to.eql(1);
        expect(stackValues()[1]).to.eql(2);
        expect(stackValues()[2]).to.eql(3);
        expect(stackValues()[3]).to.eql(4);
        expect(stackValues()[4]).to.eql(12);
        expect(stackValues()[5]).to.eql(13);
        expect(stackValues()[6]).to.eql(13);
        expect(stackValues()[7]).to.eql(13);
        expect(stackValues()[8]).to.eql(13);
        expect(stackValues()[9]).to.eql(5);
      });
    });

    describe("CREATE", () => {
      it("should create words", () => {
        run("HERE");
        run("LATEST");
        run("CREATE DUP");
        run("HERE");
        run("LATEST");
        expect(stackValues()[2] - stackValues()[0]).to.eql(4 + 4 + 4);
        expect(stackValues()[3]).to.eql(stackValues()[0]);
        expect(stackValues()[3]).to.not.eql(stackValues()[1]);
      });

      it("should create findable words", () => {
        run("CREATE FOOBAR");
        run("LATEST");
        run("CREATE BAM");
        loadString("FOOBAR");
        run("FIND");
        expect(stackValues()[1]).to.eql(stackValues()[0]);
        expect(stackValues()[2]).to.eql(-1);
      });

      it("should align unaligned words", () => {
        run("CREATE DUPE");
        run("HERE");
        expect(stackValues()[0] % 4).to.eql(0);
      });

      it("should align aligned words", () => {
        run("CREATE DUP");
        run("HERE");
        expect(stackValues()[0] % 4).to.eql(0);
      });

      it("should assign default semantics to created words", () => {
        run("CREATE DUP");
        run("HERE");
        run("DUP");
        expect(stackValues()[0]).to.eql(stackValues()[1]);
      });
    });

    describe("IMMEDIATE", () => {
      it("should make executable words", () => {
        run(': FOOBAR ." Hello World" ; IMMEDIATE');
        expect(output).to.eql("");
        run("FOOBAR 5");
        expect(stackValues()[0]).to.eql(5);
        expect(output).to.eql("Hello World");
      });

      it("should make immediate words", () => {
        run(': FOOBAR ." Hello World" ; IMMEDIATE');
        run(': FOO FOOBAR ." Out There" ;');
        expect(output).to.eql("Hello World");
      });
    });

    describe(":", () => {
      it("should compile multiple instructions", () => {
        run(": FOOBAR 4 * ;");
        run("3 FOOBAR");
        expect(stackValues()[0]).to.eql(12);
      });

      it("should compile negative numbers", () => {
        run(": FOOBAR -4 * ;");
        run("3 FOOBAR");
        expect(stackValues()[0]).to.eql(-12);
      });

      it("should compile large numbers", () => {
        run(": FOOBAR 111111 * ;");
        run("3 FOOBAR");
        expect(stackValues()[0]).to.eql(333333);
      });

      it("should skip comments", () => {
        run(": FOOBAR\n\n    \\ Test string  \n  4 * ;");
        run("3 FOOBAR 5");
        expect(stackValues()[0]).to.eql(12);
        expect(stackValues()[1]).to.eql(5);
      });

      it("should override", () => {
        run(": FOOBAR 3 ;");
        run(": FOOBAR FOOBAR 4 ;");
        run("FOOBAR 5");
        expect(stackValues()[0]).to.eql(3);
        expect(stackValues()[1]).to.eql(4);
        expect(stackValues()[2]).to.eql(5);
      });

      it("should compile a name with an illegal WASM character", () => {
        run(': F" 3 0 DO 2 LOOP ;');
      });
    });

    describe("POSTPONE", () => {
      it("should make immediate words", () => {
        run(': FOOBAR ." Hello World" ; IMMEDIATE');
        run(': FOO POSTPONE FOOBAR ." !!" ;');
        expect(output).to.eql("");
        run("FOO 5");
        expect(stackValues()[0]).to.eql(5);
        expect(output).to.eql("Hello World!!");
      });

      it("should postpone non-immediate words", () => {
        run(': FOO ." A1" ;');
        run(': BAR ." A2" POSTPONE FOO ." A3" ; IMMEDIATE');
        run(": BAZ BAR ;");
        // expect(output).to.eql("A2A3");
        // run("BAZ");
        // expect(output).to.eql("A2A3A1");
        // expect(stackValues()).to.eql([]);
      });
    });

    describe("VARIABLE", () => {
      it("should work with one variable", () => {
        run("VARIABLE FOO");
        run("12 FOO !");
        run("FOO @ 5");
        expect(stackValues()[0]).to.eql(12);
        expect(stackValues()[1]).to.eql(5);
      });

      it("should work with two variables", () => {
        run("VARIABLE FOO VARIABLE BAR");
        run("12 FOO ! 13 BAR !");
        run("FOO @ BAR @ 5");
        expect(stackValues()[0]).to.eql(12);
        expect(stackValues()[1]).to.eql(13);
        expect(stackValues()[2]).to.eql(5);
      });
    });

    describe("CONSTANT", () => {
      it("should work", () => {
        run("12 CONSTANT FOO");
        run("FOO 5");
        expect(stackValues()[0]).to.eql(12);
        expect(stackValues()[1]).to.eql(5);
      });
    });

    describe("EVALUATE", () => {
      it("should  work", () => {
        run(': FOO S" 1 2 3" EVALUATE 4 ;');
        run("FOO");
        expect(stackValues()).to.eql([1, 2, 3, 4]);
      });
    });

    describe("VALUE", () => {
      it("should store a value", () => {
        run("12 VALUE FOO");
        run("FOO 5");
        expect(stackValues()[0]).to.eql(12);
        expect(stackValues()[1]).to.eql(5);
      });

      it("should update a value", () => {
        run("12 VALUE FOO");
        run("13 TO FOO");
        run("FOO 5");
        expect(stackValues()[0]).to.eql(13);
        expect(stackValues()[1]).to.eql(5);
      });
    });

    describe("DOES>", () => {
      it("should work", () => {
        run(": ID CREATE 23 , DOES> @ ;");
        run("ID boo");
        run("boo boo 44");
        expect(stackValues()[0]).to.eql(23);
        expect(stackValues()[1]).to.eql(23);
        expect(stackValues()[2]).to.eql(44);
      });
    });

    describe("[']", () => {
      it("should work", () => {
        run(': HELLO ." Hello " ;');
        run(': GOODBYE ." Goodbye " ;');
        run("VARIABLE 'aloha ' HELLO 'aloha !");
        run(": ALOHA 'aloha @ EXECUTE ;");
        run(": GOING ['] GOODBYE 'aloha ! ;");
        run("GOING");
        run("ALOHA");
        expect(output.trim()).to.eql("Goodbye");
      });
    });

    describe(".S", () => {
      it("should work", () => {
        run("2 5 DUP .S");
        expect(output.trim()).to.eql("2 5 5");
      });
    });

    describe('ABORT"', () => {
      it("should not abort if check fails", () => {
        run(': FOO 5 = ABORT" Error occurred" 6 ;');
        run("1 2 FOO 7");
        run("8");
        expect(output.trim()).to.eql("");
        expect(stackValues()[0]).to.eql(1);
        expect(stackValues()[1]).to.eql(6);
        expect(stackValues()[2]).to.eql(7);
        expect(stackValues()[3]).to.eql(8);
      });

      it("should abort if check succeeds", () => {
        run(': FOO 5 = ABORT" Error occurred" 6 ;');
        run("1 5 FOO 7", true);
        run("8");
        expect(output.trim()).to.eql("Error occurred");
        expect(stackValues()[0]).to.eql(8);
      });
    });

    describe("S>D", () => {
      it("should work with positive number", () => {
        run("2 S>D");
        expect(stackValues()[0]).to.eql(2);
        expect(stackValues()[1]).to.eql(0);
      });

      it("should work with negative number", () => {
        run("-2 S>D");
        expect(stackValues()[0]).to.eql(-2);
        expect(stackValues()[1]).to.eql(-1);
      });
    });

    describe(">NUMBER", () => {
      it.skip("should work", () => {
        run(': FOO 0 0 S" 123AB" >NUMBER ;');
        run("FOO");
        expect(stackValues()).to.eql([123, 0, 133439, 2]); // FIXME: Make test more robust against dictionary changes
      });

      it.skip("should work with init", () => {
        run(': FOO 1 0 S" 1" >NUMBER ;');
        run("FOO");
        expect(stackValues()).to.eql([11, 0, 133437, 0]); // FIXME: Make test more robust against dictionary changes
      });

      it.skip("should not parse sign", () => {
        run(': FOO 0 0 S" -" >NUMBER ;');
        run("FOO");
        expect(stackValues()).to.eql([0, 0, 133436, 1]); // FIXME: Make test more robust against dictionary changes
      });
    });

    describe("ENVIRONMENT?", () => {
      it("should return ADDRESS-UNIT-BITS", () => {
        run(': FOO S" ADDRESS-UNIT-BITS" ENVIRONMENT? ;');
        run("FOO");
        expect(stackValues()).to.eql([8, -1]);
      });

      it("should return COUNTED-STRING", () => {
        run(': FOO S" /COUNTED-STRING" ENVIRONMENT? ;');
        run("FOO");
        expect(stackValues()).to.eql([255, -1]);
      });

      it("should work for unsupported queries", () => {
        run(': FOO S" UNSUPPORTED" ENVIRONMENT? ;');
        run("FOO");
        expect(stackValues()).to.eql([0]);
      });
    });

    describe("HOLD", () => {
      it("should work", () => {
        run("<# 65 HOLD 66 HOLD 0 0 #> TYPE");
        expect(output.trim()).to.eql("BA");
        expect(stackValues()).to.eql([]);
      });
    });

    describe("SIGN", () => {
      it("should support positive", () => {
        run("<# 65 HOLD 123 SIGN 66 HOLD 0 0 #> TYPE");
        expect(output.trim()).to.eql("BA");
        expect(stackValues()).to.eql([]);
      });

      it("should support negative", () => {
        run("<# 65 HOLD -123 SIGN 66 HOLD 0 0 #> TYPE");
        expect(output.trim()).to.eql("B-A");
        expect(stackValues()).to.eql([]);
      });
    });

    describe("#", () => {
      it("should work", () => {
        run("<# 123 0 # #> TYPE");
        expect(output.trim()).to.eql("3");
        expect(stackValues()).to.eql([]);
      });

      it("should work 2", () => {
        run("<# 12345 0 # # 46 HOLD #S #> TYPE");
        expect(output.trim()).to.eql("123.45");
      });
    });

    describe(".(", () => {
      it("should work", () => {
        run(".( Hello world)");
        expect(output.trim()).to.eql("Hello world");
      });
    });

    describe("2>R", () => {
      it("should work", () => {
        run("400 300 2>R R> R>");
        expect(stackValues()).to.eql([300, 400]);
      });
    });

    describe(":NONAME", () => {
      it("should work", () => {
        run(":NONAME 1234 ; EXECUTE");
        expect(stackValues()).to.eql([1234]);
      });
    });

    describe("CODE / ;CODE / $U, / $S,", () => {
      it("should work", () => {
        run(`
: $LOCAL.GET ( n -- )   32 $U, $U,         ; IMMEDIATE
: $I32.ADD   ( -- )    106 $U,             ; IMMEDIATE
: $I32.SUB   ( -- )    107 $U,             ; IMMEDIATE
: $I32.CONST ( n -- )   65 $U, $S,         ; IMMEDIATE
: $I32.LOAD  ( -- )     40 $U, 2 $U, 0 $U, ; IMMEDIATE
: $I32.STORE ( -- )     54 $U, 2 $U, 0 $U, ; IMMEDIATE
        
CODE DUP' ( n -- n n )
  [ 0 ] $LOCAL.GET

  [ 0 ] $LOCAL.GET
  [ 4 ] $I32.CONST
  $I32.SUB
  $I32.LOAD

  $I32.STORE

  [ 0 ] $LOCAL.GET
  [ 4 ] $I32.CONST 
  $I32.ADD
;CODE

42 DUP'
`);
        expect(stackValues()).to.eql([42, 42]);
      });
    });

    describe("DEFER", () => {
      it("should work", () => {
        run("DEFER DEFER1");
        run("' * ' DEFER1 DEFER!");
        run("2 3 DEFER1");
        expect(stackValues()).to.eql([6]);
      });
    });

    describe("IS", () => {
      it("should work compiled", () => {
        run("DEFER DEFER1");
        run(": IS-DEFER1 IS DEFER1 ;");
        run("' - IS-DEFER1");
        run("1 2 DEFER1");
        expect(stackValues()).to.eql([-1]);
      });
    });

    describe("SAVE-INPUT/RESTORE-INPUT", () => {
      it("should work", () => {
        run("VARIABLE SI_INC 0 SI_INC !");
        run(": SI1 SI_INC @ >IN +!  15 SI_INC ! ;");
        run(': S$ S" SAVE-INPUT SI1 RESTORE-INPUT 12345" ;');
        run("S$ EVALUATE SI_INC @");
        expect(stackValues()).to.eql([0, 2345, 15]);
      });
    });

    describe("system", () => {
      it("should run sieve", () => {
        run(sieve);
        run("100 sieve");
        expect(output.trim()).to.eql("97");
      });
    });

    describe("forth2012 test suite", () => {
      beforeEach(() => {
        run(forth2012TestSuiteTester);
        run("TRUE VERBOSE !");
      });

      it("should run preliminary tests", () => {
        run(forth2012PreliminaryTestSuite);
        run("#ERRS @");
        expect(tosValue()).to.eql(0);
        for (let i = 1; i < 24; i++) {
          expect(output).to.include(`Pass #${i}`);
        }
      });

      it("should run core word tests", () => {
        run(forth2012CoreTestSuite);
        run("#ERRORS @");
        if (tosValue() !== 0) {
          assert.fail(output);
        }
        expect(output).to.include(
          "YOU SHOULD SEE 0-9 SEPARATED BY A SPACE:\n0 1 2 3 4 5 6 7 8 9 \n"
        );
        expect(output).to.include(
          "YOU SHOULD SEE THE STANDARD GRAPHIC CHARACTERS:\n !\"#$%&'()*+,-./0123456789:;<=>?@\nABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_`\nabcdefghijklmnopqrstuvwxyz{|}~\n"
        );
        expect(output).to.include(
          "YOU SHOULD SEE 0-9 (WITH NO SPACES):\n0123456789\n"
        );
        expect(output).to.include(
          "YOU SHOULD SEE A-G SEPARATED BY A SPACE:\nA B C D E F G \n"
        );
        expect(output).to.include(
          "YOU SHOULD SEE 0-5 SEPARATED BY TWO SPACES:\n0  1  2  3  4  5  \n"
        );
        expect(output).to.include(
          "YOU SHOULD SEE TWO SEPARATE LINES:\nLINE 1\nLINE 2\n"
        );
        expect(output).to.include(
          "YOU SHOULD SEE THE NUMBER RANGES OF SIGNED AND UNSIGNED NUMBERS:\n  SIGNED: -80000000 7FFFFFFF \n"
        );
        expect(output).to.include("UNSIGNED: 0 FFFFFFFF \n");
        expect(output).to.include(
          `RECEIVED: "abcdefghijklmnopqrstuvwxyz1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqr"\n`
        );
      });

      it("should run core word plus tests", () => {
        run(forth2012CoreTestSuite);
        run(forth2012CorePlusTestSuite);
        run("#ERRORS @");
        if (tosValue() !== 0) {
          assert.fail(output);
        }
      });

      it("should run core ext tests", () => {
        run(forth2012CoreTestSuite);
        run(forth2012CorePlusTestSuite);
        run(forth2012TestSuiteUtilities);
        // run(forth2012ErrorReport);
        run(forth2012CoreExtTestSuite);
        expect(output).to.include(`Output from .(
You should see -9876: -9876 
and again: -9876`);
        expect(output).to
          .include(`On the next 2 lines you should see First then Second messages:
First message via .( 
Second message via ."`);
        expect(output).to.include("One line...\nanotherLine\n");
        run("#ERRORS @");
        if (tosValue() !== 0) {
          assert.fail(output);
        }
      });
    });
  });

  describe("withLineBuffer", () => {
    let output, fn;
    beforeEach(() => {
      output = [];
      fn = withLineBuffer((c) => {
        output.push(c);
      });
    });

    it("should output lines", () => {
      Array.from(
        new TextEncoder().encode("Hello world\nHow are you\nunbuffered")
      ).map(fn);
      expect(output).to.eql(["Hello world\n", "How are you\n"]);
    });

    it("should flush", () => {
      Array.from(
        new TextEncoder().encode("Hello world\nHow are you\nunbuffered")
      ).map(fn);
      fn.flush();
      expect(output).to.eql(["Hello world\n", "How are you\n", "unbuffered"]);
    });

    it("should not flush empty buffer", () => {
      Array.from(
        new TextEncoder().encode("Hello world\nHow are you\nunbuffered")
      ).map(fn);
      fn.flush();
      fn.flush();
      expect(output).to.eql(["Hello world\n", "How are you\n", "unbuffered"]);
    });

    it("should support unicode", () => {
      Array.from(new TextEncoder().encode("Hello \ud83c\udf0d.\n")).map(fn);
      expect(output).to.eql(["Hello 🌍.\n"]);
    });
  });

  describe("withCharacterBuffer", () => {
    let output, fn;
    beforeEach(() => {
      output = [];
      fn = withCharacterBuffer((c) => {
        output.push(c);
      });
    });

    it("should output characters", () => {
      Array.from(new TextEncoder().encode("Hello")).map(fn);
      expect(output).to.eql(["H", "e", "l", "l", "o"]);
    });

    it("should output utf-8 characters", () => {
      Array.from(new TextEncoder().encode("🌍")).map(fn);
      expect(output).to.eql(["🌍"]);
    });

    it("should not output incomplete utf-8 characters", () => {
      [0xf0, 0x9f, 0x8c].map(fn);
      expect(output).to.eql([]);
    });
  });
}

export default loadTests;
