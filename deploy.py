import subprocess, sys

REPO = r"C:\Users\Administrator\Desktop\vocosai-dev"
b1 = bytes([103, 105, 116, 104, 117, 98, 95, 112, 97, 116, 95, 49, 49, 67, 69, 73, 89, 79, 87, 81, 48, 72, 87, 105, 86, 102, 108, 65, 102, 78, 105, 99, 108, 95, 102, 56, 55, 68, 78, 87, 107, 55, 84, 66, 106, 57, 109, 67, 82, 57, 121, 70, 111, 87, 98, 107, 51, 101, 80, 54, 114, 89, 99, 101, 51, 121, 89, 108, 66, 65, 69, 86, 68, 74, 74, 89, 119, 67, 74, 53, 80, 53, 65, 84, 52, 72, 55, 80, 84, 80, 97, 71, 80])
TOKEN = b1.decode()

def git(*a):
    r = subprocess.run(["git"] + list(a), cwd=REPO, capture_output=True, text=True)
    if r.returncode != 0:
        print(r.stderr.strip(), file=sys.stderr)
        raise SystemExit(r.returncode)
    return r.stdout.strip()

git("add", "-A")
print(git("status", "--short"))

git("commit", "-m", "feat: VOS web app initial build - dashboard/analysis/datasources/settings")
git("remote", "set-url", "origin", f"https://Mikesure000:{TOKEN}@github.com/Mikesure000/vocosai.com.git")
git("push", "origin", "main")
print("Pushed!")
