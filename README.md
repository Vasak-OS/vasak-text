# vasak-text — el editor de texto de VasakOS

Abre un archivo de configuración, un `README`, un log, un `.json` que alguien
quiere mirar. **No es un IDE**: sin servidor de lenguaje, sin depurador, sin
árbol de proyecto, sin control de versiones, sin extensiones y sin terminal
integrada. Eso está escrito a propósito, porque es lo que lo mantiene
terminable.

Existe porque el escritorio no tenía ninguno: lo único que enviábamos era `nano`,
así que «abrir» sobre un `.txt` desde el gestor de archivos no encontraba nada
—su `open_with_default` resuelve por tipo MIME— y no pasaba nada.

Armado sobre [`vapp`](https://github.com/Vasak-OS/vapp), la plantilla del
escritorio: Tauri 2 + Vue 3 + TypeScript + Tailwind 4. Lo que la plantilla ya
resuelve —idioma de la sesión, CSP, clic derecho, iconos, tema— está explicado
en su README y no se repite acá.

---

## Las cuatro decisiones que definen esta aplicación

### 1. No cambiar lo que no se pidió

Un editor que reformatea al guardar es peor que no tener editor. Alguien abre un
`.conf` para cambiar una línea, guarda, y el `git diff` muestra el archivo
entero porque se normalizaron los finales de línea. Eso no se nota hasta que ya
pasó.

`src-tauri/src/documento.rs` recuerda el archivo **como estaba** —su fin de
línea, si terminaba con salto— y lo reconstruye igual al guardar. Adentro el
texto siempre usa `\n`; la conversión ocurre en los bordes y hay un test que la
comprueba de ida y vuelta para cada caso, incluido el archivo vacío frente al de
una línea vacía, que son archivos distintos.

Un archivo que no es UTF-8 válido **no se abre**: se avisa. La alternativa
—leerlo con reemplazo de caracteres inválidos— haría que guardar escribiera
rombos `U+FFFD` donde había bytes con información.

### 2. Guardado atómico, y no pisar lo que cambió en disco

Se escribe a un temporal en el mismo directorio y se renombra. `fs::write`
trunca el archivo **antes** de terminar de escribirlo: una interrupción a mitad
de camino lo deja vacío o partido. En un archivo de ajustes eso ya es malo; acá
es el documento de alguien.

Y si el archivo cambió en disco desde que se abrió, no se sobrescribe: se avisa
y se ofrece recargar o guardar en otro lado. Alguien pudo haberlo editado con
otro programa mientras estaba abierto acá.

### 3. Los archivos los lee y escribe Rust, no el WebView

No está `tauri-plugin-fs`. Ese plugin necesita un `scope`, y el `scope` que hace
falta para un editor de texto es «todo el home»: cualquier cosa que llegue a
ejecutarse en el WebView heredaría ese permiso.

Lo que el WebView puede hacer es exactamente leer un archivo que nombra,
escribir un archivo que nombra y preguntar si existe —`src-tauri/src/comandos.rs`—
más el selector del sistema, que corre del lado de Rust y devuelve una ruta, no
permisos.

### 4. Las pestañas, genéricas

El pedido original era reutilizar el sistema de la terminal. Al ir a buscarlo
apareció que **ya está duplicado** entre la terminal y el gestor de archivos
—`TabDraggableComponent` es idéntico en las dos— y que su tipo `Tab` tiene
cuatro de sus ocho campos que no son de la terminal, porque se copió del gestor
y le crecieron los propios encima.

Copiarlo una tercera vez dejaba el problema tres veces más grande. Así que acá el
modelo no sabe qué hay en una pestaña: `id`, `titulo`, `sucio` y un `datos`
opaco que cada aplicación define (`src/tools/pestanas.ts`), y un componente de
fila que sólo recibe títulos y avisa lo que la mano hizo
(`src/components/tabs/`).

**Los dos están escritos para mudarse a un paquete compartido**
—`@vasakgroup/vue-tabs`— con la terminal y el gestor como los siguientes
consumidores. Eso todavía no se hizo: lo que se hizo fue no agregar una tercera
copia.

---

## El editor

**CodeMirror 6**, no Monaco. Monaco pesa varios megabytes y arrastra su propio
modelo de edición; acá el WebView es WebKitGTK y la aplicación que edita texto no
puede ser la que más memoria consume del escritorio.

**Un estado por pestaña.** Lo fácil sería reemplazar el contenido de la vista al
cambiar de pestaña, y funciona hasta que alguien vuelve a la anterior y aprieta
deshacer: el historial es parte del estado, así que un estado compartido
significa que el deshacer de un archivo deshace en el otro.

**Los lenguajes se cargan por demanda.** Cada uno es su propio paquete con su
propio analizador; abrir un `.txt` no tiene por qué pagar el de HTML. Están los
que alguien abre de verdad en este sistema —Markdown, JSON, TOML, INI, shell,
Rust, TypeScript/JavaScript, Vue, Python, CSS, HTML, XML, diff— y no «todos».
Agregar uno es una línea en cada mapa de `src/tools/lenguajes.ts`; `PKGBUILD`
está ahí por nombre completo, porque no tiene extensión y es el archivo que más
se edita en este proyecto.

**La fuente y los colores salen del escritorio.** La monoespaciada es
`vasak.conf` → `fonts.terminal` por el gestor de configuración, y el resaltado
usa la paleta de la terminal. El editor se ve como la terminal **por
construcción** y no por coincidencia, y el modo oscuro sale gratis porque no hay
ningún color escrito en `src/tools/tema.ts`.

### Atajos

| | |
|---|---|
| `Ctrl+S` / `Ctrl+Shift+S` | guardar / guardar como |
| `Ctrl+O` | abrir |
| `Ctrl+T`, `Ctrl+N` | pestaña nueva |
| `Ctrl+W` | cerrar pestaña |
| `Ctrl+Alt+←` / `Ctrl+Alt+→` | pestaña anterior / siguiente |
| `Ctrl+F`, `Ctrl+G` | buscar y reemplazar, ir a línea |
| `Ctrl+Z` / `Ctrl+Shift+Z` | deshacer / rehacer |

Van declarados **dentro** del mapa de teclas de CodeMirror y con la precedencia
más alta: mientras el foco está en el editor, CodeMirror ve las teclas primero,
así que un escucha en la ventana no recibiría `Ctrl+S` nunca. No es `Ctrl+Tab`
para cambiar de pestaña porque el compositor y el motor se lo quedan antes.

---

## Integración con el escritorio

El `.desktop` sale de `src-tauri/vasak-text.desktop.hbs` y lleva `MimeType` y
`Exec=… %F`. Sin lo primero el gestor de archivos no lo encuentra; sin lo segundo
el escritorio lo lanza sin decirle qué archivo y se abre una ventana vacía. El
paquete corre `update-desktop-database`, que es lo que hace que la asociación
exista.

**Una sola instancia**: `vasak-text notas.md` con la ventana ya abierta entra
como pestaña nueva y trae la ventana al frente, en lugar de levantar un segundo
WebKit. Traerla al frente es un mensaje de D-Bus al escritorio porque en Wayland
un cliente no puede robarse el foco.

---

## Desarrollo

```bash
bun install
bun run tauri dev
```

Antes de cada commit, las tres cosas:

```bash
bun run lint && bun run vue-tsc --noEmit && bun test && (cd src-tauri && cargo clippy --all-targets -- -D warnings && cargo test)
```

Los tests cubren lo que se rompe callado: la ida y vuelta de los finales de
línea, el guardado que conserva permisos, el archivo que cambió en disco, cuál
pestaña queda activa al cerrar, y el mapeo de lenguajes.

Para probar la ventana hay que compilar con el protocolo propio, o el WebView
queda vacío:

```bash
cd src-tauri && cargo build --features custom-protocol
```

## Licencia

GPLv3.
