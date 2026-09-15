import { createWriteStream } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";

const outputDirectory = new URL("../assets/sounds/", import.meta.url);
const sounds = {
  werewolf: { freq: 180, accent: 340, seconds: 1.3 },
  witch: { freq: 420, accent: 620, seconds: 1.1 },
  vampire: { freq: 155, accent: 260, seconds: 1.4 },
};

await mkdir(outputDirectory, { recursive: true });

for (const [name, config] of Object.entries(sounds)) {
  const sampleRate = 22050;
  const totalFrames = Math.floor(sampleRate * config.seconds);
  const dataSize = totalFrames * 2;
  const buffer = Buffer.alloc(44 + dataSize);

  buffer.write("RIFF", 0, "ascii");
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write("WAVE", 8, "ascii");
  buffer.write("fmt ", 12, "ascii");
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36, "ascii");
  buffer.writeUInt32LE(dataSize, 40);

  for (let i = 0; i < totalFrames; i += 1) {
    const t = i / sampleRate;
    const rising = Math.min(1, t * 10);
    const falling = Math.max(0, 1 - t / config.seconds);
    const envelope = rising * falling;
    const base = Math.sin(2 * Math.PI * config.freq * t);
    const accent = Math.sin(2 * Math.PI * config.accent * t) * 0.35;
    const subtle = Math.sin(2 * Math.PI * 7 * t) * 0.15;
    const value = (base * 0.75 + accent + subtle) * envelope * 0.8;
    const clamped = Math.max(-1, Math.min(1, value));
    const sample = Math.round(clamped * 32767);
    buffer.writeInt16LE(sample, 44 + i * 2);
  }

  const outputPath = new URL(`${name}-challenge.wav`, outputDirectory);
  await new Promise((resolve, reject) => {
    const stream = createWriteStream(outputPath);
    stream.on("error", reject);
    stream.on("finish", resolve);
    stream.end(buffer);
  });
}

const moduleContents = `export const chaserSounds = {\n  werewolf: require("./werewolf-challenge.wav"),\n  witch: require("./witch-challenge.wav"),\n  vampire: require("./vampire-challenge.wav"),\n};\n`;
await writeFile(new URL("index.ts", outputDirectory), moduleContents);
console.log("Generated local WAV challenge sounds.");
