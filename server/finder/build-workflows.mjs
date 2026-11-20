// Generates the two Finder Quick Action bundles (server/finder/*.workflow). Run: node server/finder/build-workflows.mjs
// install.sh copies them to ~/Library/Services; nothing here touches the system.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const xml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export const OPEN_SCRIPT = `PORT=7123
enc() {
  local LC_ALL=C s="$1" i c out=""
  for ((i = 0; i < \${#s}; i++)); do
    c="\${s:i:1}"
    case "$c" in [a-zA-Z0-9.~_/-]) out+="$c" ;; *) out+="$(printf '%%%02X' "'$c")" ;; esac
  done
  printf '%s' "$out"
}
for f in "$@"; do
  /usr/bin/open "http://localhost:$PORT/?open=$(enc "$f")"
done
`;

export const PDF_SCRIPT = `PORT=7123
BASE="http://localhost:$PORT"
json_str() {
  local s="$1"
  s="\${s//\\\\/\\\\\\\\}"
  s="\${s//\\"/\\\\\\"}"
  printf '"%s"' "$s"
}
note() {
  /usr/bin/osascript - "$1" "$2" <<'AS'
on run argv
  display notification (item 2 of argv) with title "DataSave" subtitle (item 1 of argv)
end run
AS
}
[ $# -gt 0 ] || exit 0
paths=""
for f in "$@"; do paths="$paths\${paths:+,}$(json_str "$f")"; done
body="{\\"paths\\":[$paths],\\"formats\\":[\\"pdf\\"],\\"dest\\":{\\"mode\\":\\"beside\\"}}"
resp="$(/usr/bin/curl -sS -m 15 -X POST -H 'X-DataSave: 1' -H "Origin: $BASE" -H 'Content-Type: application/json' -d "$body" "$BASE/api/batch")" || { note "خطا" "سرور DataSave در دسترس نیست."; exit 1; }
id="$(printf '%s' "$resp" | sed -n 's/.*"id":"\\([^"]*\\)".*/\\1/p')"
[ -n "$id" ] || { note "خطا" "سرور درخواست را نپذیرفت (Chrome یا فایل را بررسی کنید)."; exit 1; }
txt=""
for _ in $(seq 1 900); do
  txt="$(/usr/bin/curl -fsS -m 15 "$BASE/api/batch/$id?text=1")" || break
  case "$(printf '%s\\n' "$txt" | head -n 1)" in "STATUS running"*) sleep 1 ;; *) break ;; esac
done
head="$(printf '%s\\n' "$txt" | head -n 1)"
ok="\${head##*ok=}"; ok="\${ok%% *}"
failed="\${head##*failed=}"
if [ "$failed" = "0" ] && [ -n "$ok" ]; then note "PDF ساخته شد" "$ok فایل کنار فایل اصلی ذخیره شد."; else note "PDF با خطا تمام شد" "موفق: \${ok:-0} · ناموفق: \${failed:-?}"; exit 1; fi
`;

const DEFS = [
  { dir: 'DataSave Open.workflow', menu: 'DataSave: باز کن', script: OPEN_SCRIPT },
  { dir: 'DataSave PDF.workflow', menu: 'DataSave: PDF بساز', script: PDF_SCRIPT },
];
export const FILE_TYPES = ['public.plain-text', 'public.text', 'public.html', 'net.daringfireball.markdown'];
const head = '<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n<plist version="1.0">';

export function infoPlist(menu) {
  return `${head}
<dict>
	<key>NSServices</key>
	<array>
		<dict>
			<key>NSBackgroundColorName</key>
			<string>background</string>
			<key>NSIconName</key>
			<string>NSActionTemplate</string>
			<key>NSMenuItem</key>
			<dict>
				<key>default</key>
				<string>${xml(menu)}</string>
			</dict>
			<key>NSMessage</key>
			<string>runWorkflowAsService</string>
			<key>NSRequiredContext</key>
			<dict>
				<key>NSApplicationIdentifier</key>
				<string>com.apple.finder</string>
			</dict>
			<key>NSSendFileTypes</key>
			<array>
${FILE_TYPES.map((t) => `				<string>${t}</string>`).join('\n')}
			</array>
		</dict>
	</array>
</dict>
</plist>
`;
}

export function wflow(script, uuid) {
  return `${head}
<dict>
	<key>AMApplicationBuild</key>
	<string>523</string>
	<key>AMApplicationVersion</key>
	<string>2.10</string>
	<key>AMDocumentVersion</key>
	<string>2</string>
	<key>actions</key>
	<array>
		<dict>
			<key>action</key>
			<dict>
				<key>AMAccepts</key>
				<dict>
					<key>Container</key>
					<string>List</string>
					<key>Optional</key>
					<true/>
					<key>Types</key>
					<array>
						<string>com.apple.cocoa.path</string>
					</array>
				</dict>
				<key>AMActionVersion</key>
				<string>2.0.3</string>
				<key>AMApplication</key>
				<array>
					<string>Automator</string>
				</array>
				<key>AMParameterProperties</key>
				<dict>
					<key>COMMAND_STRING</key>
					<dict/>
					<key>CheckedForUserDefaultShell</key>
					<dict/>
					<key>inputMethod</key>
					<dict/>
					<key>shell</key>
					<dict/>
					<key>source</key>
					<dict/>
				</dict>
				<key>AMProvides</key>
				<dict>
					<key>Container</key>
					<string>List</string>
					<key>Types</key>
					<array>
						<string>com.apple.cocoa.string</string>
					</array>
				</dict>
				<key>ActionBundlePath</key>
				<string>/System/Library/Automator/Run Shell Script.action</string>
				<key>ActionName</key>
				<string>Run Shell Script</string>
				<key>ActionParameters</key>
				<dict>
					<key>COMMAND_STRING</key>
					<string>${xml(script)}</string>
					<key>CheckedForUserDefaultShell</key>
					<true/>
					<key>inputMethod</key>
					<integer>1</integer>
					<key>shell</key>
					<string>/bin/bash</string>
					<key>source</key>
					<string></string>
				</dict>
				<key>BundleIdentifier</key>
				<string>com.apple.RunShellScript</string>
				<key>CFBundleVersion</key>
				<string>2.0.3</string>
				<key>CanShowSelectedItemsWhenRun</key>
				<false/>
				<key>CanShowWhenRun</key>
				<true/>
				<key>Category</key>
				<array>
					<string>AMCategoryUtilities</string>
				</array>
				<key>Class Name</key>
				<string>RunShellScriptAction</string>
				<key>InputUUID</key>
				<string>${uuid.in}</string>
				<key>Keywords</key>
				<array>
					<string>Shell</string>
					<string>Script</string>
				</array>
				<key>OutputUUID</key>
				<string>${uuid.out}</string>
				<key>UUID</key>
				<string>${uuid.id}</string>
				<key>UnlocalizedApplications</key>
				<array>
					<string>Automator</string>
				</array>
				<key>arguments</key>
				<dict>
					<key>0</key>
					<dict>
						<key>default value</key>
						<string>cat</string>
						<key>name</key>
						<string>COMMAND_STRING</string>
						<key>required</key>
						<string>0</string>
						<key>type</key>
						<string>0</string>
						<key>uuid</key>
						<string>0</string>
					</dict>
					<key>1</key>
					<dict>
						<key>default value</key>
						<false/>
						<key>name</key>
						<string>CheckedForUserDefaultShell</string>
						<key>required</key>
						<string>0</string>
						<key>type</key>
						<string>0</string>
						<key>uuid</key>
						<string>1</string>
					</dict>
					<key>2</key>
					<dict>
						<key>default value</key>
						<string></string>
						<key>name</key>
						<string>source</string>
						<key>required</key>
						<string>0</string>
						<key>type</key>
						<string>0</string>
						<key>uuid</key>
						<string>2</string>
					</dict>
					<key>3</key>
					<dict>
						<key>default value</key>
						<string>/bin/sh</string>
						<key>name</key>
						<string>shell</string>
						<key>required</key>
						<string>0</string>
						<key>type</key>
						<string>0</string>
						<key>uuid</key>
						<string>3</string>
					</dict>
					<key>4</key>
					<dict>
						<key>default value</key>
						<integer>0</integer>
						<key>name</key>
						<string>inputMethod</string>
						<key>required</key>
						<string>0</string>
						<key>type</key>
						<string>0</string>
						<key>uuid</key>
						<string>4</string>
					</dict>
				</dict>
				<key>isViewVisible</key>
				<integer>1</integer>
				<key>location</key>
				<string>309.000000:305.000000</string>
				<key>nibPath</key>
				<string>/System/Library/Automator/Run Shell Script.action/Contents/Resources/Base.lproj/main.nib</string>
			</dict>
			<key>isViewVisible</key>
			<integer>1</integer>
		</dict>
	</array>
	<key>connectors</key>
	<dict/>
	<key>workflowMetaData</key>
	<dict>
		<key>serviceInputTypeIdentifier</key>
		<string>com.apple.Automator.fileSystemObject</string>
		<key>serviceOutputTypeIdentifier</key>
		<string>com.apple.Automator.nothing</string>
		<key>serviceProcessesInput</key>
		<integer>0</integer>
		<key>workflowTypeIdentifier</key>
		<string>com.apple.Automator.servicesMenu</string>
	</dict>
</dict>
</plist>
`;
}

// Stable UUIDs so regenerating gives identical files.
const UUIDS = [
  { id: '6F2C7B14-9D3A-4E58-8A21-0C5B7E1D4A01', in: '6F2C7B14-9D3A-4E58-8A21-0C5B7E1D4A02', out: '6F2C7B14-9D3A-4E58-8A21-0C5B7E1D4A03' },
  { id: '6F2C7B14-9D3A-4E58-8A21-0C5B7E1D4B01', in: '6F2C7B14-9D3A-4E58-8A21-0C5B7E1D4B02', out: '6F2C7B14-9D3A-4E58-8A21-0C5B7E1D4B03' },
];

export const WORKFLOWS = DEFS;

export function build(outDir = here) {
  DEFS.forEach((d, i) => {
    const c = path.join(outDir, d.dir, 'Contents');
    fs.mkdirSync(c, { recursive: true });
    fs.writeFileSync(path.join(c, 'Info.plist'), infoPlist(d.menu));
    fs.writeFileSync(path.join(c, 'document.wflow'), wflow(d.script, UUIDS[i]));
  });
}

if (process.argv[1] && fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) build();
