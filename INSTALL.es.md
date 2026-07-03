# Instalación

## Requisitos previos

- OpenCode v1.17.8+ ([anomalyco/opencode](https://github.com/anomalyco/opencode))
- Node.js o Bun (para compilar)

## Instalación rápida (desde código fuente)

```bash
git clone https://github.com/anibalardid/opencode-ollama-stats-plugin.git
cd ollama-cloud-usage
npm install
npm run build
opencode plugin -g "$(pwd)"
```

Reiniciá OpenCode. Vas a ver una sección **Ollama Cloud** en la sidebar.

## Configuración de la cookie

El plugin necesita tu cookie `__Secure-session` de [ollama.com/settings](https://ollama.com/settings).

**Opción A — variable de entorno (recomendada):**

```bash
export OLLAMA_USAGE_COOKIE="valor-de-tu-cookie"
```

**Opción B — archivo de configuración:**

Creá `~/.config/opencode/opencode-quota/ollama-cloud.json`:

```json
{
  "cookie": "valor-de-tu-cookie"
}
```

**Opción C — archivo legacy:**

Creá `~/.config/ollama-usage/config.yaml`:

```yaml
cookie: "valor-de-tu-cookie"
```

### Cómo obtener la cookie

1. Abrí [ollama.com/settings](https://ollama.com/settings) en tu navegador
2. Abrí DevTools → Storage → Cookies
3. Copiá el valor de `__Secure-session`

## Cómo actualizar

```bash
cd ollama-cloud-usage
git pull
npm install
npm run build
# Reiniciá OpenCode
```

## Desinstalar

```bash
opencode plugin -g "$(pwd)"
# Después borrá la carpeta
rm -rf ollama-cloud-usage
```

## Requisitos

- macOS / Linux
- Una cuenta activa de Ollama Cloud con una cookie de sesión válida
