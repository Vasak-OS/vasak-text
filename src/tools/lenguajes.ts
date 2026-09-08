/**
 * Qué lenguaje es un archivo, y cómo se carga su resaltador.
 *
 * Son dos cosas separadas a propósito. **Decidir** el lenguaje es una función
 * pura sobre el nombre del archivo, y por lo tanto se puede probar sin montar
 * nada; **cargarlo** es un `import()` dinámico, y por eso no está en el mismo
 * lugar.
 *
 * La carga es por demanda y no en el arranque porque cada lenguaje es su propio
 * paquete con su propio analizador: los diecisiete que hay acá juntos pesan más
 * que el resto de la aplicación, y abrir un `.txt` no tiene por qué pagar el
 * analizador de HTML. Es la misma razón por la que el editor es CodeMirror y no
 * Monaco.
 *
 * La lista no es «todos los lenguajes»: son los que alguien abre de verdad en
 * este sistema. Agregar uno es una línea en cada uno de los dos mapas.
 */

// `StreamLanguage` va estático y no dinámico: `@codemirror/language` ya está en
// el paquete principal porque lo usa el tema, así que importarlo por demanda no
// separa nada — sólo agrega cuatro `import()` que Vite avisa que no puede mover.
import { StreamLanguage } from '@codemirror/language';
import type { Extension } from '@codemirror/state';

/** Los lenguajes que el editor conoce. */
export type Lenguaje =
	| 'markdown'
	| 'json'
	| 'yaml'
	| 'toml'
	| 'ini'
	| 'shell'
	| 'rust'
	| 'javascript'
	| 'typescript'
	| 'vue'
	| 'python'
	| 'css'
	| 'html'
	| 'xml'
	| 'diff';

/**
 * Por extensión, sin el punto y en minúsculas.
 *
 * `.ts` va a `typescript` y no a `javascript` aunque el paquete sea el mismo:
 * la diferencia está en cómo se lo configura al cargarlo, y tenerlas separadas
 * acá deja eso decidido en un solo lugar.
 */
export const POR_EXTENSION: Record<string, Lenguaje> = {
	md: 'markdown',
	markdown: 'markdown',
	json: 'json',
	jsonc: 'json',
	yaml: 'yaml',
	yml: 'yaml',
	toml: 'toml',
	ini: 'ini',
	conf: 'ini',
	desktop: 'ini',
	service: 'ini',
	sh: 'shell',
	bash: 'shell',
	zsh: 'shell',
	rs: 'rust',
	js: 'javascript',
	mjs: 'javascript',
	cjs: 'javascript',
	jsx: 'javascript',
	ts: 'typescript',
	mts: 'typescript',
	tsx: 'typescript',
	vue: 'vue',
	py: 'python',
	css: 'css',
	scss: 'css',
	html: 'html',
	htm: 'html',
	xml: 'xml',
	svg: 'xml',
	diff: 'diff',
	patch: 'diff',
};

/**
 * Por nombre completo, para los archivos que no tienen extensión.
 *
 * `PKGBUILD` es shell y es el archivo que más se edita en este proyecto: sin
 * esta entrada se abría sin resaltar ninguno. Las claves se comparan en
 * minúsculas.
 */
export const POR_NOMBRE: Record<string, Lenguaje> = {
	pkgbuild: 'shell',
	'.bashrc': 'shell',
	'.zshrc': 'shell',
	'.bash_profile': 'shell',
	'.profile': 'shell',
	dockerfile: 'shell',
	'.gitconfig': 'ini',
	'.editorconfig': 'ini',
	'vasak.conf': 'ini',
};

/** El último segmento de una ruta. */
function nombreDe(ruta: string): string {
	const partes = ruta.split('/');
	return partes[partes.length - 1] ?? ruta;
}

/**
 * Qué lenguaje es este archivo, o `null` si no se sabe.
 *
 * `null` no es un error: es texto sin resaltar, que es lo correcto para un
 * `.txt` o un log.
 *
 * Manda el **nombre completo** sobre la extensión, porque los casos del primer
 * mapa son justamente los que la extensión no acierta.
 */
export function lenguajeDe(ruta: string | null): Lenguaje | null {
	if (ruta === null) return null;

	const nombre = nombreDe(ruta).toLowerCase();
	if (nombre in POR_NOMBRE) return POR_NOMBRE[nombre];

	// Desde el último punto, y sólo si no es el primer carácter: en `.bashrc` el
	// punto abre el nombre, no una extensión, y tomarlo daría la «extensión»
	// `bashrc`.
	const punto = nombre.lastIndexOf('.');
	if (punto <= 0) return null;

	const extension = nombre.slice(punto + 1);
	return POR_EXTENSION[extension] ?? null;
}

/**
 * Trae el resaltador de un lenguaje.
 *
 * Cada rama es un `import()` con la ruta escrita literal, y no un template
 * `@codemirror/lang-${clave}`: los empaquetadores necesitan ver la cadena para
 * poder separar el trozo, y con una ruta armada Vite no puede y termina metiendo
 * todo en el paquete principal — o sea, justo lo que este módulo evita.
 */
export async function cargar(lenguaje: Lenguaje): Promise<Extension> {
	switch (lenguaje) {
		case 'markdown':
			return (await import('@codemirror/lang-markdown')).markdown();
		case 'json':
			return (await import('@codemirror/lang-json')).json();
		case 'yaml':
			return (await import('@codemirror/lang-yaml')).yaml();
		case 'rust':
			return (await import('@codemirror/lang-rust')).rust();
		case 'javascript':
			return (await import('@codemirror/lang-javascript')).javascript();
		case 'typescript':
			return (await import('@codemirror/lang-javascript')).javascript({ typescript: true });
		case 'vue':
			return (await import('@codemirror/lang-vue')).vue();
		case 'python':
			return (await import('@codemirror/lang-python')).python();
		case 'css':
			return (await import('@codemirror/lang-css')).css();
		case 'html':
			return (await import('@codemirror/lang-html')).html();
		case 'xml':
			return (await import('@codemirror/lang-xml')).xml();
		// Los cuatro que no tienen paquete propio: vienen como modos del
		// CodeMirror 5 y se envuelven. Funcionan igual; lo que no tienen es un
		// árbol de sintaxis, que acá no se usa para nada.
		case 'toml': {
			const { toml } = await import('@codemirror/legacy-modes/mode/toml');
			return StreamLanguage.define(toml);
		}
		case 'ini': {
			const { properties } = await import('@codemirror/legacy-modes/mode/properties');
			return StreamLanguage.define(properties);
		}
		case 'shell': {
			const { shell } = await import('@codemirror/legacy-modes/mode/shell');
			return StreamLanguage.define(shell);
		}
		case 'diff': {
			const { diff } = await import('@codemirror/legacy-modes/mode/diff');
			return StreamLanguage.define(diff);
		}
	}
}
