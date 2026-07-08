# Instalación

## Requisitos previos

- OpenCode v1.17.8+ ([anomalyco/opencode](https://github.com/anomalyco/opencode))
- Node.js o Bun (para compilar)

## Instalación rápida (desde código fuente)

```bash
git clone https://github.com/Pivert/opencode-ollama-stats-plugin.git
cd opencode-ollama-stats-plugin
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

1. Abrí [ollama.com/settings](https://ollama.com/settings) en tu navegador e iniciá sesión
2. Abrí DevTools (`F12` o `Cmd+Opt+I` en macOS)
3. Andá a la pestaña **Application** (Chrome/Edge) o **Storage** (Firefox)
4. En la barra lateral izquierda, expandí **Cookies** y hacé clic en `ollama.com`
5. Buscá la fila con nombre `__Secure-session`
6. Hacé doble clic en la columna **Value** y copiala

El valor de la cookie es un string largo y opaco — debería verse como un JWT o un token en base64. No lo compartas con nadie.

## Cómo actualizar

```bash
cd opencode-ollama-stats-plugin
git pull
npm install
npm run build
# Reiniciá OpenCode
```

## Desinstalar

```bash
opencode plugin -g "$(pwd)"
# Después borrá la carpeta
rm -rf opencode-ollama-stats-plugin
```

## Requisitos

- macOS / Linux
- Una cuenta activa de Ollama Cloud con una cookie de sesión válida
