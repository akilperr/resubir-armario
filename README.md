# Resubir Armario

[![Versión](https://img.shields.io/github/v/release/akilperr/resubir-armario?label=versi%C3%B3n)](https://github.com/akilperr/resubir-armario/releases/latest)
[![Licencia: MIT](https://img.shields.io/badge/licencia-MIT-blue.svg)](LICENSE)
![Navegadores](https://img.shields.io/badge/navegadores-Chrome%20%7C%20Brave%20%7C%20Edge-informational)
![Manifest V3](https://img.shields.io/badge/manifest-v3-lightgrey)

Extensión de navegador gratuita y de código abierto para **resubir tus artículos de Vinted**, de forma que vuelvan a aparecer como recién publicados.

Permite resubir un artículo suelto o seleccionar varios y procesarlos **de forma escalonada**, con un intervalo configurable entre cada uno.

> [!IMPORTANT]
> Proyecto independiente y **no oficial**. No está afiliado, patrocinado ni respaldado por Vinted. Úsalo bajo tu responsabilidad y lee el [aviso legal](#aviso-legal) antes de empezar.

> [!NOTE]
> **Versión inicial (1.0).** Te recomendamos hacer la primera prueba con un artículo que no te importe y [comunicar cualquier fallo](#informar-de-un-problema).

## Índice

- [Funciones](#funciones)
- [Instalación](#instalación)
- [Uso](#uso)
- [Cómo funciona](#cómo-funciona)
- [Privacidad](#privacidad)
- [Limitaciones y recomendaciones](#limitaciones-y-recomendaciones)
- [Informar de un problema](#informar-de-un-problema)
- [Contribuir](#contribuir)
- [Aviso legal](#aviso-legal)
- [Licencia](#licencia)

## Funciones

- **Resubida individual** con un clic desde la página del artículo.
- **Selección múltiple:** carga tu armario, marca los artículos que quieras (o todos) y añádelos a la cola.
- **Resubida escalonada:** eliges cada cuántos minutos se procesa un artículo; cada pausa varía un ±20 % al azar.
- **Cola persistente:** se guarda en el navegador y se puede pausar, reanudar o vaciar.
- **Copia de seguridad automática:** si algo falla después de borrar un anuncio, sus datos se conservan para reintentar la publicación o exportarlos en `.json`.
- **Sin cuentas ni servidores:** todo se ejecuta localmente en tu navegador.
- Compatible con vinted.es, .fr, .it, .pt, .de, .co.uk y .com.

## Instalación

Funciona en **Google Chrome**, **Brave** y otros navegadores basados en Chromium (Edge, Opera…). Firefox no está soportado por ahora.

1. Descarga el archivo `resubir-armario-vX.X.zip` de la [última versión](https://github.com/akilperr/resubir-armario/releases/latest) y descomprímelo en una carpeta que no vayas a borrar.
2. Abre la página de extensiones de tu navegador:

   | Navegador | Dirección |
   |---|---|
   | Chrome | `chrome://extensions` |
   | Brave | `brave://extensions` |
   | Edge | `edge://extensions` |

3. Activa el **Modo desarrollador** (arriba a la derecha).
4. Pulsa **Cargar descomprimida** y selecciona la carpeta `resubir-armario` (la que contiene `manifest.json`).
5. Recarga la pestaña de Vinted si la tenías abierta.

> [!TIP]
> En **Brave**, si algo no funciona, desactiva los Escudos (icono del león) solo para Vinted.

### Actualizar

1. Descarga el `.zip` de la [última versión](https://github.com/akilperr/resubir-armario/releases/latest) y sustituye los archivos de la carpeta.
2. En la página de extensiones, pulsa **↻** en Resubir Armario.
3. Recarga la pestaña de Vinted.

## Uso

### Resubir un artículo

1. Inicia sesión en Vinted y abre uno de tus artículos.
2. Pulsa el botón redondo **🔁** (abajo a la derecha).
3. Pulsa **Resubir este artículo ahora**.

### Resubir varios artículos de forma escalonada

1. Entra en tu perfil (tu armario).
2. Pulsa **🔁** y después **Cargar mis artículos**. Los artículos reservados y vendidos no aparecen.
3. Marca los artículos que quieras resubir, o marca **Todos**.
4. Indica cada cuántos **minutos** se resube uno y pulsa **Empezar**.
5. **Mantén abierta al menos una pestaña de Vinted** (puede estar en segundo plano).

Desde el panel puedes consultar el progreso y **pausar**, **reanudar** o **vaciar** la cola. Si añades artículos mientras una cola está en marcha, se colocan al final.

> [!TIP]
> El último artículo resubido queda el primero en tu armario. Si quieres que uno concreto aparezca arriba, márcalo el último.

## Cómo funciona

Para cada artículo, la extensión:

1. Lee los datos del anuncio: título, descripción, precio, categoría, talla, marca, estado y colores.
2. Descarga las fotos y las vuelve a subir.
3. Guarda una copia de seguridad en el navegador.
4. Borra el anuncio original (Vinted no permite dos anuncios idénticos a la vez).
5. Publica el anuncio nuevo con los mismos datos.

### Estructura del proyecto

| Archivo | Descripción |
|---|---|
| `manifest.json` | Configuración de la extensión |
| `content.js` | Panel, lógica de resubida y cola |
| `content.css` | Estilos del panel |
| `background.js` | Descarga de las fotos |
| `popup.html` / `popup.js` | Ventana del icono de la extensión |

## Privacidad

La extensión utiliza la sesión que ya tienes abierta en Vinted. **No recopila, almacena ni envía contraseñas ni datos personales a ningún servidor externo.** Los datos de la cola y las copias de seguridad se guardan únicamente en el almacenamiento local de tu navegador.

## Limitaciones y recomendaciones

- **Normas de Vinted:** los Términos de Vinted no permiten la automatización. El uso de esta extensión puede ir en contra de ellos y provocar la limitación o suspensión de tu cuenta. Para reducir el riesgo:
  - Deja **entre 5 y 10 minutos** entre artículos.
  - Evita resubir decenas de artículos cada día.
- **Favoritos y visitas:** el anuncio nuevo empieza de cero, como con cualquier método de resubida.
- **Cambios en Vinted:** Vinted puede modificar su web en cualquier momento y hacer que la extensión deje de funcionar hasta que se actualice.

## Informar de un problema

1. Pulsa **F12** en la pestaña de Vinted y abre la pestaña **Consola**.
2. Copia los mensajes en rojo o los que empiecen por `[Resubir Armario]`.
3. Abre un [*issue*](https://github.com/akilperr/resubir-armario/issues) con ese texto, eliminando antes cualquier dato personal.

Si un artículo se borró pero no llegó a publicarse, pulsa **Reintentar publicaciones pendientes** en el panel. También puedes descargar la copia de seguridad desde el icono de la extensión.

## Contribuir

Las contribuciones son bienvenidas: abre un [*issue*](https://github.com/akilperr/resubir-armario/issues) con tu propuesta o envía un *pull request*. Es especialmente útil saber si funciona en otros países de Vinted además de España.

## Aviso legal

Resubir Armario es un proyecto independiente, gratuito y sin ánimo de lucro. **No está afiliado, asociado, autorizado, patrocinado ni respaldado por Vinted** ni por ninguna de sus filiales. "Vinted" es una marca de sus respectivos titulares y se menciona aquí únicamente para indicar con qué servicio es compatible la extensión.

El software se proporciona "tal cual", sin garantías de ningún tipo. Cada usuario es responsable de cumplir los Términos y Condiciones de Vinted y de las consecuencias de utilizar esta herramienta.

## Licencia

Distribuido bajo la [licencia MIT](LICENSE).
