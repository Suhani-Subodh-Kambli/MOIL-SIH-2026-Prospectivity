import { spawn } from "child_process";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../../..");

export function runShortfallPrediction(payload) {
  return new Promise((resolve, reject) => {
    const python = process.env.PYTHON_EXECUTABLE || "python";
    const script = path.join(root, "production_shortfall", "predict.py");
    const child = spawn(python, [script], { cwd: root });
    let stdout = "";
    let stderr = "";

    child.stdout.on("data", d => stdout += d.toString());
    child.stderr.on("data", d => stderr += d.toString());
    child.on("error", reject);
    child.on("close", code => {
      if (code !== 0) return reject(new Error(stderr || `Python exited with code ${code}`));
      try { resolve(JSON.parse(stdout)); }
      catch { reject(new Error(`Invalid predictor response: ${stdout}`)); }
    });

    child.stdin.write(JSON.stringify(payload));
    child.stdin.end();
  });
}
