import { describe, expect, it } from "vitest";
import type { Entry } from "./backend";
import { crumbs, firstFile, parentOf, trail, uniqueName } from "./tree";

const file = (path: string): Entry => ({ name: path.split("/").pop()!, path, folder: false, children: [] });
const folder = (path: string, children: Entry[]): Entry => ({ name: path.split("/").pop()!, path, folder: true, children });

const tree = [
  folder("/n/lessons", [folder("/n/lessons/week1", [file("/n/lessons/week1/loops.py")]), file("/n/lessons/notes.txt")]),
  file("/n/data.txt"),
];

describe("tree", () => {
  it("finds the folders to open to show a file", () => {
    expect(trail(tree, "/n/lessons/week1/loops.py")).toEqual(["/n/lessons", "/n/lessons/week1"]);
    expect(trail(tree, "/n/data.txt")).toEqual([]);
    expect(trail([folder("/n/less", [])], "/n/lessons/x.py")).toEqual([]);
  });

  it("opens the first Python file, even inside folders", () => {
    expect(firstFile(tree)?.path).toBe("/n/lessons/week1/loops.py");
    expect(firstFile([file("/n/a.txt")])).toBeUndefined();
  });

  it("numbers new names that are taken, ignoring capitals", () => {
    expect(uniqueName([], "untitled", ".py")).toBe("untitled.py");
    expect(uniqueName(["Untitled.py", "untitled 2.py"], "untitled", ".py")).toBe("untitled 3.py");
  });

  it("splits paths on either slash", () => {
    expect(parentOf("C:\\Users\\me\\Nib\\a.py")).toBe("C:\\Users\\me\\Nib");
    expect(crumbs("/n", "/n/lessons/week1/loops.py")).toEqual({ folders: ["lessons", "week1"], name: "loops.py" });
  });
});
