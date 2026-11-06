import { test, expect } from "vitest";
import type { FailedLine } from "./pipeline";
import { selectBatchRetryFiles } from "./retry";

// #88:「重试失败行」曾把整批文件原样喂回批量翻译,干净文件走缓存不再发请求,
// 但导出照常落盘,导出目录攒出全量 `x (1).srt` 副本。重试集合必须收敛到
// 真有失败行的文件,同时拿不到可靠标签时不能把重试整个吞掉。

const files = [{ name: "a.srt" }, { name: "b.srt" }, { name: "c.srt" }];

const failed = (overrides: Partial<FailedLine> & { file?: string }): FailedLine => ({ text: "x", ...overrides });

test("keeps only the files that have failed lines", () => {
  const selected = selectBatchRetryFiles(files, [
    failed({ file: "b.srt", index: 3 }),
    failed({ file: "b.srt", index: 7 }),
  ]);
  // 同一文件多行失败也只重跑一次,不按行数复制文件。
  expect(selected).toEqual([{ name: "b.srt" }]);
});

test("keeps every file that has failed lines and drops the clean ones", () => {
  const selected = selectBatchRetryFiles(files, [
    failed({ file: "a.srt", index: 1 }),
    failed({ file: "c.srt", index: 2 }),
  ]);
  expect(selected).toEqual([{ name: "a.srt" }, { name: "c.srt" }]);
});

test("returns the full list when no failure carries a file tag", () => {
  // 标签缺失(旧路径/异常)退回全量:漏掉重试比重复导出更糟。
  const selected = selectBatchRetryFiles(files, [failed({ index: 1 }), failed({})]);
  expect(selected).toEqual(files);
  expect(selected).not.toBe(files);
});

test("returns the full list when no tagged failure matches any file", () => {
  // 一个都对不上(文件已被移出列表、改名)同样退回全量。
  const selected = selectBatchRetryFiles(files, [failed({ file: "gone.srt", index: 1 })]);
  expect(selected).toEqual(files);
  expect(selected).not.toBe(files);
});

test("returns a copy, never the caller's array, when filtering", () => {
  const selected = selectBatchRetryFiles(files, [failed({ file: "a.srt", index: 1 })]);
  expect(selected).toEqual([{ name: "a.srt" }]);
  expect(files).toHaveLength(3);
});
