# FastF1 Pitwall

Dashboard web estático para explorar sesiones de Fórmula 1 procesadas con
[FastF1](https://github.com/theOehrly/Fast-F1). Está diseñado para publicarse
en GitHub Pages y no requiere cuentas, claves ni un servidor para los visitantes.

## Qué incluye

- Comparación de dos pilotos por vuelta rápida.
- Telemetría sincronizada: velocidad, acelerador, freno, marcha y DRS.
- Delta de tiempo aproximado por distancia.
- Mapa de pista coloreado por velocidad.
- Ritmo vuelta a vuelta, estrategia de neumáticos y clasificación.
- Condiciones meteorológicas e información metodológica.
- Exportación de la selección a CSV.

## Ejecutar localmente

Desde la raíz del proyecto:

```bash
python3 -m http.server 8080
```

Después, abre <http://localhost:8080>.

## Regenerar datos

FastF1 requiere Python 3.10 o posterior.

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python scripts/export_sessions.py --session 2024 Monaco Q --session 2024 Monaco R
```

El comando genera `data/manifest.json` y un archivo compacto por sesión.

Los datasets de demostración incluidos fueron generados desde las respuestas
congeladas oficiales usadas para compilar la documentación de FastF1. Así, el
demo es reproducible y no depende de credenciales privadas.

Las actualizaciones con sesiones distintas usan FastF1 3.9 y requieren que el
propietario configure `F1_USERNAME` y `F1_PASSWORD` como secretos del
repositorio. Esas credenciales se utilizan únicamente dentro de GitHub Actions;
los visitantes del sitio nunca necesitan una cuenta de F1 ni de GPT.

## Publicar en GitHub Pages

1. Crea un repositorio público y sube estos archivos.
2. En **Settings → Pages**, selecciona **GitHub Actions** como origen.
3. El workflow incluido publica el sitio en cada cambio de `main`.

También se incluye un workflow manual, **Update FastF1 data**, que permite
regenerar los datos indicando año, evento y sesión desde la pestaña Actions.

## Aviso

Este es un proyecto no oficial y no está asociado con Formula 1, Formula One
Management ni la FIA. Las marcas relacionadas pertenecen a sus respectivos
propietarios. Los datos pueden contener correcciones posteriores de la fuente.

