const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const { execFile, execFileSync } = require("child_process");
const { promisify } = require("util");
const execFileAsync = promisify(execFile);
const { generateBillDocx } = require("./billDocx");

async function convertDocxToPdf({ type, party, entry }) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "fusion-bill-"));
  const base = `${type === "Service" ? "Service-Receipt" : "Invoice"}-${entry.invoiceNo || String(entry._id).slice(-8)}`.replace(/[^\w.-]+/g, "-");
  const docxPath = path.join(tmp, `${base}-${crypto.randomUUID()}.docx`);
  try {
    const { buffer } = await generateBillDocx({ type, party, entry });
    fs.writeFileSync(docxPath, buffer);
    const outDir = path.join(tmp, "out");
    fs.mkdirSync(outDir);
    let soffice = process.platform === "win32" ? "soffice.exe" : "libreoffice";
    if (process.platform === "win32") {
      const candidates = [
        "C:\\Program Files\\LibreOffice\\program\\soffice.exe",
        "C:\\Program Files (x86)\\LibreOffice\\program\\soffice.exe",
        "soffice.exe",
      ];
      soffice = candidates.find((candidate) => {
        if (candidate.endsWith(".exe") && candidate.includes("\\")) return fs.existsSync(candidate);
        try { execFileSync("where", [candidate], { stdio: "ignore" }); return true; } catch { return false; }
      });
      if (!soffice) throw new Error("LibreOffice is required to create the PDF. Install LibreOffice and restart the backend.");
    }
    await execFileAsync(soffice, ["--headless", "--convert-to", "pdf", "--outdir", outDir, docxPath], { timeout: 60000, windowsHide: true });
    const pdfPath = path.join(outDir, `${path.basename(docxPath, ".docx")}.pdf`);
    if (!fs.existsSync(pdfPath)) throw new Error("PDF conversion engine did not create the PDF");
    return { buffer: fs.readFileSync(pdfPath), fileName: `${base}.pdf` };
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

module.exports = { convertDocxToPdf };
