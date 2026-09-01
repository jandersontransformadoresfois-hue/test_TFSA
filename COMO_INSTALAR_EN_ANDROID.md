# Inspección de Transformadores — App web instalable (PWA) para Android

Esta es la misma aplicación (datos de placa, relación de transformación
trifásica, resistencia de aislamiento, resistencia de devanados, rigidez
dieléctrica, observaciones, resumen, gráficos, exportación a PDF/TXT y
diagnóstico según IEEE C57.12.90/C57.12.00, CIGRE y ASTM D877/D1816),
reescrita como una **aplicación web progresiva (PWA)**: se instala en
Android como un ícono más, funciona **100% sin conexión a internet**
una vez instalada, y **no requiere Google Play ni un archivo .apk**.

## Por qué una PWA y no un .apk

La app de escritorio está hecha en Python + Tkinter, y Tkinter no existe
en Android. Reescribirla en HTML/JS y empaquetarla como PWA permite:
- Instalarla en el teléfono con un solo toque desde Chrome (ícono en
  la pantalla de inicio, se abre en pantalla completa, sin barra de
  navegador).
- Que funcione sin internet (todos los archivos, incluida la librería
  de gráficos y de generación de PDF, quedan cacheados en el teléfono).
- Evitar la complejidad de compilar un .apk nativo (Android
  SDK/NDK/Gradle), que requiere herramientas que no están disponibles
  en este entorno.

Si en el futuro se necesita específicamente un archivo `.apk` (por
ejemplo, para distribuirlo fuera de la Play Store como instalador
tradicional), el código de esta carpeta es compatible con herramientas
como **Bubblewrap** o **PWABuilder**, que "envuelven" una PWA como esta
en un `.apk` real firmando el paquete — eso sí requiere Android
SDK/Java en la máquina donde se genere, algo que se puede hacer más
adelante si hace falta.

## Cómo instalarla en el teléfono Android

La PWA necesita servirse por **http(s)** (no funciona abriendo
`index.html` directamente con doble clic / `file://`, porque el
Service Worker que la hace funcionar offline no se activa así).
Opciones, de la más simple a la más permanente:

### Opción A — Servidor local rápido (para probarla ya)
1. Copie la carpeta `transformer_inspection_pwa` a una computadora.
2. Con Python instalado, abra una terminal dentro de esa carpeta y
   ejecute:
   ```
   python -m http.server 8080
   ```
3. En la misma red Wi-Fi, abra en el navegador Chrome del teléfono
   Android: `http://<IP-de-la-computadora>:8080`
   (la IP se ve con `ipconfig` en Windows o `ifconfig`/`ip a` en Linux/Mac).
4. Chrome mostrará un banner "Agregar a pantalla de inicio" / un menú
   ⋮ → **"Instalar aplicación"**. Tóquelo.
5. Ya queda instalada como ícono. A partir de ahí funciona sin
   necesitar el servidor ni la misma red — todo quedó cacheado en el
   teléfono.

### Opción B — Alojarla en un hosting gratuito (recomendado para uso real)
Suba la carpeta completa (tal cual, sin modificar) a cualquier hosting
estático gratuito, por ejemplo:
- **GitHub Pages** (crear un repositorio, subir estos archivos,
  activar Pages).
- **Netlify** o **Vercel** (arrastrar la carpeta a su panel — "drag &
  drop deploy").
- **Firebase Hosting**.

Una vez publicada, abra la URL en Chrome desde el teléfono y siga el
mismo paso de "Instalar aplicación" del punto 4 anterior. Esta opción
es mejor porque la URL queda fija y se puede compartir con otros
inspectores sin depender de que una computadora esté encendida.

## Uso

La app tiene las mismas 8 secciones que la versión de escritorio:
Datos del transformador, Relación de transformación (trifásica: fases
A/B/C), Resistencia de aislamiento, Resistencia de devanados, Rigidez
dieléctrica, Observaciones, Resumen y Gráficos. Cada prueba tiene su
botón **"Calcular sección"** y **"Repetir / limpiar sección"** para
recalcular de forma independiente.

- **Guardado automático**: cada vez que se calcula una sección, los
  datos quedan guardados en el propio teléfono (almacenamiento local
  del navegador). Si se cierra la app o se queda sin batería, al
  volver a abrirla los datos siguen ahí.
- **"Nuevo"** (botón superior): borra todo y empieza un expediente
  nuevo — pide confirmación antes de borrar.
- **Exportar PDF / Exportar TXT**: generan el archivo y lo descargan
  directamente al teléfono (carpeta de Descargas), igual que al
  descargar cualquier archivo desde Chrome.

## Actualizar la app más adelante

Si se modifica el código (por ejemplo, para ajustar un criterio de
diagnóstico), basta con volver a subir los archivos actualizados al
mismo hosting. La próxima vez que el usuario abra la app con
conexión a internet, el Service Worker detecta la nueva versión y la
actualiza automáticamente en segundo plano.

## Estructura de archivos

```
transformer_inspection_pwa/
├── index.html            # Estructura de la interfaz (8 pestañas)
├── manifest.json          # Metadatos de instalación (ícono, nombre, colores)
├── service-worker.js      # Cacheo offline
├── css/style.css
├── js/
│   ├── calculations.js    # Fórmulas y diagnósticos (puerto de calculations.py)
│   ├── charts.js           # Gráficos (Chart.js)
│   ├── pdf-export.js       # Generación de PDF (jsPDF + autotable)
│   ├── txt-export.js       # Generación de TXT
│   └── app.js               # Interfaz, estado y guardado local
├── vendor/                 # Librerías empaquetadas localmente (funcionan sin internet)
│   ├── chart.umd.min.js
│   ├── jspdf.umd.min.js
│   └── jspdf.plugin.autotable.min.js
└── icons/                   # Íconos de instalación
```
