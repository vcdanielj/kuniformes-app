import fs from 'fs';
import path from 'path';
import { computeBiReportData } from './dist/bi/compute.js';
import { generateBusinessIntelligencePdf } from './dist/pdf/bi-report-generator.js';

// Load pdf-lib from self-contained bundle
const pdfLibCode = fs.readFileSync('node_modules/pdf-lib/dist/pdf-lib.min.js', 'utf-8');
const fn = new Function(pdfLibCode + '; return PDFLib;');
const pdfLib = fn();

const dumpPath = '/Users/daniel/.gemini/antigravity-ide/brain/a5c5aede-19e4-4aa4-bf1c-1c114f58ae18/scratch/d1_dump.json';
const data = JSON.parse(fs.readFileSync(dumpPath, 'utf-8'));

console.log('Computing BI metrics...');
const biData = computeBiReportData(data);
console.log('BI Metrics computed successfully:');
console.log(`- Total Revenue: $${biData.totalRevenueUsd}`);
console.log(`- Total Orders: ${biData.totalOrders}`);
console.log(`- Total Units: ${biData.totalUnitsSold}`);
console.log(`- Gross Margin: ${biData.grossMarginPct.toFixed(1)}%`);

const logoPath = path.resolve('public/assets/logo.jpg');
const logoBytes = fs.existsSync(logoPath) ? fs.readFileSync(logoPath) : null;
console.log('Logo loaded:', logoBytes ? `${logoBytes.length} bytes` : 'NOT FOUND');

console.log('Generating 7-Page Executive PDF with pdf-lib...');
const pdfBytes = await generateBusinessIntelligencePdf(biData, {
  brandName: 'K-Uniformes',
  rif: 'J-50468923-1',
  logoBytes: logoBytes ? new Uint8Array(logoBytes) : null,
  pdfLib,
});

const outPath = path.resolve('Reporte_Inteligencia_Comercial_KUniformes.pdf');
fs.writeFileSync(outPath, Buffer.from(pdfBytes));
console.log(`✓ PDF successfully generated at: ${outPath} (${(pdfBytes.length / 1024).toFixed(1)} KB)`);

// Also copy to artifacts dir for easy viewing/embedding
const artifactPath = '/Users/daniel/.gemini/antigravity-ide/brain/a5c5aede-19e4-4aa4-bf1c-1c114f58ae18/Reporte_Inteligencia_Comercial_KUniformes.pdf';
fs.writeFileSync(artifactPath, Buffer.from(pdfBytes));
console.log(`✓ Artifact PDF copied to: ${artifactPath}`);
