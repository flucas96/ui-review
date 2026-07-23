#!/usr/bin/env node

import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ffmpegPath from "ffmpeg-static";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const outputDirectory = join(repositoryRoot, "docs/demo");
const imageDirectory = join(repositoryRoot, "docs/images");
const reviewDirectory = join(repositoryRoot, "output/playwright/review-frames");

if (ffmpegPath === null) {
  throw new Error("ffmpeg-static did not provide an ffmpeg executable");
}

await Promise.all([
  mkdir(outputDirectory, { recursive: true }),
  mkdir(imageDirectory, { recursive: true }),
  mkdir(reviewDirectory, { recursive: true }),
]);

const videos = [
  {
    generator: "generate-demo.mjs",
    mode: "product",
    output: "ui-review-demo.mp4",
    poster: "ui-review-demo-poster.jpg",
    posterTime: "00:00:49",
    sheetInterval: 4,
    sheetLayout: "4x4",
  },
  {
    generator: "generate-demo.mjs",
    mode: "full",
    output: "ui-review-full-workflow.mp4",
    poster: "ui-review-full-workflow-poster.jpg",
    posterTime: "00:00:27",
    sheetInterval: 6,
    sheetLayout: "4x4",
  },
  {
    generator: "generate-social-demo.mjs",
    mode: "social",
    output: "ui-review-social-teaser.mp4",
    poster: "ui-review-social-teaser-poster.jpg",
    posterTime: "00:00:00.8",
    sheetInterval: 0.75,
    sheetLayout: "4x4",
    trimStart: 0.25,
  },
];

const requestedTarget = process.env.DEMO_TARGET;
const selectedVideos = requestedTarget === undefined
  ? videos
  : videos.filter(({ mode }) => mode === requestedTarget);
if (selectedVideos.length === 0) {
  throw new Error(`Unknown DEMO_TARGET: ${requestedTarget ?? ""}`);
}

for (const video of selectedVideos) {
  const rawPath = await generate(video.generator, video.mode);
  const outputPath = join(outputDirectory, video.output);
  await encode(rawPath, outputPath, video.trimStart);
  await poster(outputPath, join(imageDirectory, video.poster), video.posterTime);
  await contactSheet(
    outputPath,
    join(reviewDirectory, `${video.mode}-contact-sheet.jpg`),
    video.sheetInterval,
    video.sheetLayout,
  );
  process.stdout.write(`Rendered ${video.output}\n`);
}

async function generate(generator, mode) {
  const stdout = await run(process.execPath, [join(dirname(fileURLToPath(import.meta.url)), generator)], {
    ...process.env,
    ...(mode === "full" ? { DEMO_MODE: "full" } : {}),
  });
  const videoPath = stdout.trim().split("\n").at(-1);
  if (videoPath === undefined || videoPath.length === 0) {
    throw new Error(`${generator} did not return a raw video path`);
  }
  return videoPath;
}

async function encode(inputPath, outputPath, trimStart) {
  await run(ffmpegPath, [
    "-y",
    ...(trimStart === undefined ? [] : ["-ss", String(trimStart)]),
    "-i",
    inputPath,
    "-an",
    "-c:v",
    "libx264",
    "-crf",
    "19",
    "-movflags",
    "+faststart",
    "-pix_fmt",
    "yuv420p",
    "-preset",
    "medium",
    "-r",
    "30",
    outputPath,
  ]);
}

async function poster(inputPath, outputPath, time) {
  await run(ffmpegPath, [
    "-y",
    "-ss",
    time,
    "-i",
    inputPath,
    "-frames:v",
    "1",
    "-q:v",
    "2",
    outputPath,
  ]);
}

async function contactSheet(inputPath, outputPath, interval, layout) {
  await run(ffmpegPath, [
    "-y",
    "-i",
    inputPath,
    "-frames:v",
    "1",
    "-vf",
    `fps=1/${String(interval)},scale=480:-1,tile=${layout}:padding=6:margin=6`,
    "-q:v",
    "3",
    outputPath,
  ]);
}

async function run(command, arguments_, environment = process.env) {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(command, arguments_, {
      cwd: repositoryRoot,
      env: environment,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.once("error", rejectPromise);
    child.once("exit", (code) => {
      if (code === 0) {
        resolvePromise(stdout);
        return;
      }
      rejectPromise(new Error(`${command} exited with ${String(code)}\n${stderr}`));
    });
  });
}
