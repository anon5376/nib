/** Python's error, as the runner reports it. */
export interface PyError {
  kind: string;
  message: string;
  line: number | null;
  text: string;
}

export interface Explanation {
  title: string;
  detail: string;
}

const TYPE_NAMES: Record<string, string> = {
  int: "a whole number",
  float: "a decimal number",
  str: "text",
  list: "a list",
  dict: "a dictionary",
  tuple: "a tuple",
  bool: "True or False",
  NoneType: "None",
};
const typeName = (t: string) => TYPE_NAMES[t] ?? `a ${t}`;
const quoted = (s: string) => s.match(/'([^']*)'/)?.[1] ?? "";
const didYouMean = (text: string) => text.match(/Did you mean: '([^']+)'\?/)?.[1];

function syntax(message: string): Explanation {
  if (message.includes("Missing parentheses in call to 'print'"))
    return { title: "print needs brackets", detail: 'Write it as print("like this"). Older Python didn\'t need them; Python 3 does.' };
  const unclosed = message.match(/'(.)' was never closed/);
  if (unclosed)
    return { title: `A "${unclosed[1]}" is never closed`, detail: "Add the matching closing bracket, usually at the end of this line." };
  if (message.startsWith("expected ':'"))
    return { title: "This line needs a colon at the end", detail: "Lines starting with if, elif, else, for, while or def end with a colon (:)." };
  if (message.startsWith("unterminated string literal"))
    return { title: "Some text is missing its closing quote", detail: 'Text starts and ends with the same quote mark: "like this" or \'like this\'.' };
  if (message.includes("forgot a comma"))
    return { title: "A comma looks to be missing", detail: "Separate the things inside brackets with commas." };
  if (message.includes("Maybe you meant '=='"))
    return { title: "To compare, use == instead of =", detail: "One = gives a name a value. Two == check whether two things are equal." };
  if (message.startsWith("cannot assign to"))
    return { title: "The left side of = can't be given a value", detail: "Only a name goes on the left of =. To compare two things, use ==." };
  return { title: "Python can't read this line", detail: "Look for a missing bracket, quote, comma or colon here or on the line just above." };
}

function indentation(kind: string, message: string): Explanation {
  if (kind === "TabError" || message.includes("inconsistent use of tabs"))
    return { title: "Tabs and spaces are mixed in this indent", detail: "Indent with spaces only. Pressing Tab here inserts 4 spaces." };
  if (message.startsWith("expected an indented block"))
    return { title: "This line needs to be indented", detail: "The line after a colon belongs to it, so it moves in by 4 spaces. Press Tab at its start." };
  if (message.startsWith("unexpected indent"))
    return { title: "This line is indented but shouldn't be", detail: "Move it back so it lines up with the line above." };
  return { title: "This line's indent doesn't line up", detail: "Line it up exactly with one of the lines above it." };
}

function typeError(message: string): Explanation {
  if (message.startsWith("can only concatenate str"))
    return { title: "Text and a number can't be joined with +", detail: "Turn the number into text with str(…), or give print() both, separated by a comma." };
  const operands = message.match(/unsupported operand type\(s\) for (.+?): '(\w+)' and '(\w+)'/);
  if (operands) {
    const [, op, a, b] = operands;
    const fromInput = a === "str" || b === "str" ? " If the text came from input(), turn it into a number with int(…) or float(…) first." : "";
    return { title: `Can't use ${op} between ${typeName(a)} and ${typeName(b)}`, detail: `Both sides need to be the same kind of value.${fromInput}` };
  }
  const missing = message.match(/^(\w+)\(\) missing \d+ required positional arguments?: (.+)$/);
  if (missing)
    return { title: `${missing[1]}() needs more values between its brackets`, detail: `Missing: ${missing[2].replaceAll("'", "")}.` };
  const count = message.match(/^(\w+)\(\) takes .+ \((\d+) given\)$|^(\w+)\(\) takes \d+ positional arguments? but (\d+) were given$/);
  if (count)
    return { title: `${count[1] ?? count[3]}() was given the wrong number of values`, detail: message };
  const callable = message.match(/^'(\w+)' object is not callable$/);
  if (callable)
    return { title: `${typeName(callable[1])} can't be run with ( )`, detail: "Brackets after a name run it. Check that this name wasn't reused for something else earlier." };
  const subscript = message.match(/^'(\w+)' object is not subscriptable$/);
  if (subscript)
    return { title: `${typeName(subscript[1])} can't be used with [ ]`, detail: "Square brackets pick one item out of a list, a dictionary or some text." };
  return { title: "A value is the wrong kind for what this line does", detail: message };
}

export function explain(error: PyError): Explanation {
  const { kind, message, text } = error;
  const suggestion = didYouMean(text);
  switch (kind) {
    case "NameError": {
      const name = quoted(message);
      return suggestion
        ? { title: `There's no "${name}". Did you mean "${suggestion}"?`, detail: "Names have to be spelled the same way every time, capitals included." }
        : { title: `Python doesn't know "${name}" yet`, detail: "Check the spelling, or give it a value on a line above this one." };
    }
    case "UnboundLocalError":
      return { title: `"${quoted(message)}" is used before it has a value`, detail: "Inside this function, give it a value before the line that uses it." };
    case "SyntaxError":
      return syntax(message);
    case "IndentationError":
    case "TabError":
      return indentation(kind, message);
    case "TypeError":
      return typeError(message);
    case "ValueError": {
      if (message.startsWith("invalid literal for int()"))
        return { title: `"${quoted(message)}" isn't a whole number`, detail: 'int() turns text like "42" into a number. Anything else, like letters or a decimal point, stops it.' };
      if (message.startsWith("could not convert string to float"))
        return { title: `"${quoted(message)}" isn't a number Python can read`, detail: "Decimal numbers use a dot, like 1.5." };
      return { title: "A value isn't one this line can use", detail: message };
    }
    case "ZeroDivisionError":
      return { title: "This divides by zero", detail: "Nothing can be divided by 0. Check the number after / or %." };
    case "IndexError":
      return { title: "That position is past the end", detail: "Positions start at 0, so a list of 3 items has positions 0, 1 and 2." };
    case "KeyError":
      return { title: `The dictionary has no key ${message}`, detail: "Check the spelling, or add that key before reading it." };
    case "AttributeError": {
      const [, owner, attr] = message.match(/^'(\w+)' object has no attribute '(\w+)'/) ?? [];
      if (owner === "NoneType")
        return { title: `None has no "${attr}"`, detail: "The value here is None, often because a function didn't return anything." };
      if (owner)
        return { title: `${typeName(owner)} has no "${attr}"${suggestion ? `. Did you mean "${suggestion}"?` : ""}`, detail: "Check the spelling after the dot." };
      return { title: "That name after the dot doesn't exist", detail: message };
    }
    case "ModuleNotFoundError":
      return { title: `There's no module called "${quoted(message)}"`, detail: "Check the spelling. Modules that don't come with Python have to be installed first." };
    case "FileNotFoundError":
      return { title: `There's no file called "${quoted(message)}"`, detail: "Files are looked for in the same folder as your program." };
    case "RecursionError":
      return { title: "A function keeps calling itself", detail: "It never reaches a point where it stops. Add a case that returns without calling itself again." };
    case "EOFError":
      return { title: "The program asked for an answer that never came", detail: "Run it again and type an answer in the output when it asks." };
    default:
      return { title: `Python stopped: ${kind}`, detail: message || text };
  }
}
