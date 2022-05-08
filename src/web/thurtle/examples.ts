export type Example = {
  name: string;
  program: string;
};

export default [
  {
    name: "Square",
    program: `
200 FORWARD
90 RIGHT
200 FORWARD
90 RIGHT
200 FORWARD
90 RIGHT
200 FORWARD
90 RIGHT
`,
  },
  {
    name: "Square (w/ LOOP)",
    program: `
: SQUARE ( n -- )
  4 0 DO
    DUP FORWARD
    90 RIGHT
  LOOP
;

250 SQUARE
`,
  },
  {
    name: "Seeker",
    program: `
: SEEKER ( n -- )
  4 0 DO
    DUP FORWARD
    PENUP
    DUP FORWARD
    PENDOWN
    DUP FORWARD
    90 RIGHT
  LOOP
;

100 SEEKER
`,
  },
  {
    name: "Flower",
    program: `
: SQUARE ( n -- )
4 0 DO
  DUP FORWARD
  90 RIGHT
LOOP
;

: FLOWER ( n -- )
  12 0 DO
    DUP SQUARE
    30 RIGHT
  LOOP
;

250 FLOWER
`,
  },
  {
    name: "Spiral (Recursive)",
    program: `
: SPIRAL ( n -- )
  DUP 1 < IF EXIT THEN 
  DUP FORWARD
  20 RIGHT
  95 100 */ RECURSE
;

140 SPIRAL
`,
  },
].map((e) => ({ ...e, program: e.program.trimStart() }));
