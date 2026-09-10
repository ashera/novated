// Free a TCP port by killing whatever is listening on it, so the dev server can
// ALWAYS bind the same port (Next auto-increments to 3001+ when its port is taken,
// which makes it hard to know where the app is running). Cross-platform; quiet
// no-op when the port is already free. Usage: node scripts/free-port.mjs [port]
import { execSync } from "node:child_process";

const port = Number(process.argv[2] || process.env.PORT || 3000);

function pidsOnPort(port) {
  const pids = new Set();
  try {
    if (process.platform === "win32") {
      const out = execSync("netstat -ano -p tcp", { encoding: "utf8" });
      for (const line of out.split(/\r?\n/)) {
        // e.g. "  TCP    0.0.0.0:3000   0.0.0.0:0   LISTENING   12345"
        const m = line.match(/:(\d+)\s+\S+\s+LISTENING\s+(\d+)/i);
        if (m && Number(m[1]) === port) pids.add(m[2]);
      }
    } else {
      const out = execSync(`lsof -tiTCP:${port} -sTCP:LISTEN || true`, { encoding: "utf8" });
      for (const pid of out.split(/\s+/).filter(Boolean)) pids.add(pid);
    }
  } catch {
    /* netstat/lsof missing or nothing listening — treat as free */
  }
  return [...pids];
}

const pids = pidsOnPort(port);
if (pids.length === 0) {
  console.log(`port ${port} is free`);
} else {
  for (const pid of pids) {
    try {
      execSync(process.platform === "win32" ? `taskkill /PID ${pid} /F` : `kill -9 ${pid}`, { stdio: "ignore" });
      console.log(`freed port ${port} (killed pid ${pid})`);
    } catch {
      console.log(`could not kill pid ${pid} on port ${port} (already gone?)`);
    }
  }
}
