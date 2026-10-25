import { describe, expect, it } from "vitest";
import { explain } from "./explain";

// Messages captured from Python 3.14.7 for the mistakes beginners make first.
const err = (kind: string, message: string, text = `${kind}: ${message}`) => explain({ kind, message, line: 1, text });

describe("explain", () => {
  it("names a misspelled name and Python's suggestion", () => {
    expect(err("NameError", "name 'totel' is not defined", "NameError: name 'totel' is not defined. Did you mean: 'total'?").title).toBe(
      `There's no "totel". Did you mean "total"?`,
    );
    expect(err("NameError", "name 'totl' is not defined").title).toBe(`Python doesn't know "totl" yet`);
  });

  it.each([
    ["'(' was never closed", `A "(" is never closed`],
    ["expected ':'", "This line needs a colon at the end"],
    ["unterminated string literal (detected at line 1)", "Some text is missing its closing quote"],
    ["Missing parentheses in call to 'print'. Did you mean print(...)?", "print needs brackets"],
    ["invalid syntax. Perhaps you forgot a comma?", "A comma looks to be missing"],
    ["cannot assign to comparison", "The left side of = can't be given a value"],
    ["invalid syntax", "Python can't read this line"],
  ])("reads the syntax error %s", (message, title) => {
    expect(err("SyntaxError", message).title).toBe(title);
  });

  it.each([
    ["IndentationError", "expected an indented block after 'for' statement on line 1", "This line needs to be indented"],
    ["IndentationError", "unexpected indent", "This line is indented but shouldn't be"],
    ["IndentationError", "unindent does not match any outer indentation level", "This line's indent doesn't line up"],
    ["TabError", "inconsistent use of tabs and spaces in indentation", "Tabs and spaces are mixed in this indent"],
  ])("reads the %s %s", (kind, message, title) => {
    expect(err(kind, message).title).toBe(title);
  });

  it("points input() text at int() when it meets a number", () => {
    const e = err("TypeError", "unsupported operand type(s) for +: 'int' and 'str'");
    expect(e.title).toBe("Can't use + between a whole number and text");
    expect(e.detail).toContain("int(…)");
    expect(err("TypeError", "unsupported operand type(s) for -: 'int' and 'float'").detail).not.toContain("input()");
  });

  it.each([
    ['can only concatenate str (not "int") to str', "Text and a number can't be joined with +"],
    ["f() missing 1 required positional argument: 'a'", "f() needs more values between its brackets"],
    ["len() takes exactly one argument (2 given)", "len() was given the wrong number of values"],
    ["greet() takes 1 positional argument but 2 were given", "greet() was given the wrong number of values"],
    ["'int' object is not callable", "a whole number can't be run with ( )"],
    ["'int' object is not subscriptable", "a whole number can't be used with [ ]"],
  ])("reads the type error %s", (message, title) => {
    expect(err("TypeError", message).title).toBe(title);
  });

  it.each([
    ["ValueError", "invalid literal for int() with base 10: 'abc'", `"abc" isn't a whole number`],
    ["ValueError", "could not convert string to float: '1,5'", `"1,5" isn't a number Python can read`],
    ["ZeroDivisionError", "division by zero", "This divides by zero"],
    ["IndexError", "list index out of range", "That position is past the end"],
    ["KeyError", "'b'", "The dictionary has no key 'b'"],
    ["ModuleNotFoundError", "No module named 'numpyy'", `There's no module called "numpyy"`],
    ["FileNotFoundError", "[Errno 2] No such file or directory: 'nope.txt'", `There's no file called "nope.txt"`],
    ["RecursionError", "maximum recursion depth exceeded", "A function keeps calling itself"],
    ["EOFError", "EOF when reading a line", "The program asked for an answer that never came"],
    ["UnboundLocalError", "cannot access local variable 'n' where it is not associated with a value", `"n" is used before it has a value`],
  ])("reads the %s %s", (kind, message, title) => {
    expect(err(kind, message).title).toBe(title);
  });

  it("names the attribute and Python's suggestion", () => {
    expect(err("AttributeError", "'str' object has no attribute 'uppr'", "AttributeError: 'str' object has no attribute 'uppr'. Did you mean: 'upper'?").title).toBe(
      `text has no "uppr". Did you mean "upper"?`,
    );
  });

  it("falls back to Python's own words for kinds it doesn't know", () => {
    expect(err("OverflowError", "math range error")).toEqual({ title: "Python stopped: OverflowError", detail: "math range error" });
  });
});
