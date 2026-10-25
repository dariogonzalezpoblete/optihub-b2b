"""
Script auxiliar para iniciar sesión directamente con Google Chrome nativo
en la carpeta 'sesion_navegador'.

Úsalo cuando necesites iniciar sesión o renovar credenciales sin que ningún
sistema anti-bot o reCAPTCHA detecte automatización.
"""
import os
import subprocess
import sys

CHROME_PATHS = [
    r"C:\Program Files\Google\Chrome\Application\chrome.exe",
    r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
    os.path.expanduser(r"~\AppData\Local\Google\Chrome\Application\chrome.exe")
]

def find_chrome():
    for p in CHROME_PATHS:
        if os.path.exists(p):
            return p
    return None

def main():
    chrome_exe = find_chrome()
    if not chrome_exe:
        print("❌ No se encontró Google Chrome en las rutas estándar.")
        sys.exit(1)

    profile_dir = os.path.abspath("sesion_navegador")
    os.makedirs(profile_dir, exist_ok=True)

    print("=" * 60)
    print("🚀 INICIANDO CHROME NATIVO PARA LOGIN SEGURO")
    print("=" * 60)
    print(f"Chrome:  {chrome_exe}")
    print(f"Perfil:  {profile_dir}")
    print("Abriendo NYWD Login...")
    print("\n1. Ingresa tu correo y contraseña.")
    print("2. Marca la casilla de 'Remember username'.")
    print("3. Resuelve el reCAPTCHA (en este Chrome nativo se validará al instante).")
    print("4. Haz clic en 'SIGN IN'.")
    print("5. Una vez que hayas ingresado al catálogo, CIERRA la ventana de Chrome.")
    print("=" * 60)

    cmd = [
        chrome_exe,
        "--remote-debugging-port=9222",
        f"--user-data-dir={profile_dir}",
        "--no-first-run",
        "--no-default-browser-check",
        "--start-maximized",
        "https://www.nywd.com/wholesale"
    ]

    proc = subprocess.Popen(cmd)
    print("\n✅ Google Chrome se ha abierto con el puerto de depuración listo.")
    print("👉 Puedes iniciar sesión tranquilamente en esa ventana.")
    print("👉 ¡NO necesitas cerrar Chrome! Puedes dejar la ventana abierta y ejecutar 'scraper.py'.")

if __name__ == "__main__":
    main()
