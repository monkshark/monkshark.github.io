import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync, rmSync } from 'node:fs';
import { join, relative, extname, sep, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const CONTENT_DIR = join(ROOT, 'content');
const OUT_DIR = join(ROOT, 'assets', 'mermaid-generated');
const MERMAID_RE = /```mermaid\r?\n([\s\S]*?)```/g;

function walk(dir, files = []) {
    for (const name of readdirSync(dir)) {
        const full = join(dir, name);
        const st = statSync(full);
        if (st.isDirectory()) walk(full, files);
        else if (extname(name) === '.md') files.push(full);
    }
    return files;
}

function renderVariant(source, outFile, configFile, svgId) {
    const tmpFile = join(tmpdir(), `mermaid-${Date.now()}-${Math.random().toString(36).slice(2)}.mmd`);
    writeFileSync(tmpFile, source, 'utf8');
    try {
        const q = (s) => `"${s}"`;
        const cmd = [
            'npx', 'mmdc',
            '-i', q(tmpFile),
            '-o', q(outFile),
            '-c', q(configFile),
            '-p', q(join(ROOT, 'scripts', 'mermaid-puppeteer-config.json')),
            '-b', 'transparent',
        ].join(' ');
        execSync(cmd, { cwd: ROOT, stdio: 'inherit' });

        const svg = readFileSync(outFile, 'utf8').split('my-svg').join(svgId);
        writeFileSync(outFile, svg, 'utf8');
    } finally {
        rmSync(tmpFile, { force: true });
    }
}

rmSync(OUT_DIR, { recursive: true, force: true });
mkdirSync(OUT_DIR, { recursive: true });

const files = walk(CONTENT_DIR);
let count = 0;

for (const file of files) {
    const text = readFileSync(file, 'utf8');
    const relPath = relative(CONTENT_DIR, file).split(sep).join('/');
    const pageHash = createHash('md5').update(relPath).digest('hex').slice(0, 12);

    let idx = 0;
    let match;
    MERMAID_RE.lastIndex = 0;
    while ((match = MERMAID_RE.exec(text))) {
        const source = match[1];
        const key = `${pageHash}-${idx}`;
        console.log(`[mermaid] ${relPath} #${idx}`);

        renderVariant(source, join(OUT_DIR, `${key}.light.svg`), join(ROOT, 'scripts', 'mermaid-light.config.json'), `mmd-${key}-light`);
        renderVariant(source, join(OUT_DIR, `${key}.dark.svg`), join(ROOT, 'scripts', 'mermaid-dark.config.json'), `mmd-${key}-dark`);

        idx++;
        count++;
    }
}

console.log(`rendered ${count} mermaid diagram(s)`);
