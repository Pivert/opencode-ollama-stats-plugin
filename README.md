# Ollama Cloud Usage

Plugin de sidebar para OpenCode que muestra el uso de **Ollama Cloud** (sesión y semanal) — obtenido desde [ollama.com/settings](https://ollama.com/settings).

```
Ollama Cloud (pro)
Session    45.3% used
████░░░░ 54.7% free
Reset in 7h
Weekly    69.5% used
██░░░░░░ 30.5% free
Reset in 3d
```

## Instalación

Ver [INSTALL.md](./INSTALL.md) para instrucciones de instalación y configuración de la cookie.

## Cómo funciona

El plugin obtiene tu página de configuración de Ollama Cloud usando la cookie `__Secure-session` y parsea el HTML para extraer:

- **Uso de sesión** — porcentaje usado en la ventana actual
- **Uso semanal** — porcentaje usado en la ventana semanal
- **Tiempos de reinicio** — cuándo se reinicia cada ventana (mostrado como tiempo relativo)
- **Plan** — tu plan (Pro, etc.)

Se actualiza cada 60 segundos y también con eventos de actividad de sesión.

### Si no hay cookie configurada

La sidebar muestra un mensaje de ayuda con las rutas e instrucciones exactas:

```
⚠ Ollama Cloud
No cookie configured
Set OLLAMA_USAGE_COOKIE
or create:
~/.config/opencode/
  opencode-quota/
    ollama-cloud.json
  → {"cookie":"..."}
```

## Fuentes de cookie (en orden de prioridad)

| Fuente | Ubicación |
|--------|-----------|
| Variable de entorno | `OLLAMA_USAGE_COOKIE` |
| Archivo JSON | `~/.config/opencode/opencode-quota/ollama-cloud.json` |
| Archivo YAML | `~/.config/ollama-usage/config.yaml` |
| YAML legacy | `~/.ollama-usage/config.yaml` |

## Archivos

| Archivo | Propósito |
|---------|-----------|
| `index.tsx` | Código fuente del plugin (JSX + Solid.js) |
| `package.json` | Manifiesto npm |
| `tsup.config.ts` | Configuración de build |
| `tsconfig.json` | Configuración de TypeScript |
| `dist/` | Salida compilada (cargada por OpenCode) |

## Licencia

MIT
