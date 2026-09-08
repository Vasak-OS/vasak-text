import { describe, expect, test } from 'bun:test';
import { lenguajeDe, POR_EXTENSION, POR_NOMBRE } from '../src/tools/lenguajes';

/**
 * Elegir el lenguaje es lo único de esta parte que se puede probar sin montar el
 * editor, y es donde están los casos que la extensión no acierta: los archivos
 * sin extensión y los que empiezan con punto.
 */

describe('qué lenguaje es un archivo', () => {
	test('por extensión', () => {
		expect(lenguajeDe('/tmp/notas.md')).toBe('markdown');
		expect(lenguajeDe('/tmp/datos.json')).toBe('json');
		expect(lenguajeDe('/tmp/Cargo.toml')).toBe('toml');
		expect(lenguajeDe('/tmp/main.rs')).toBe('rust');
	});

	test('lo que no se conoce es texto sin resaltar', () => {
		// `null` no es un error: es lo correcto para un `.txt` o un log.
		expect(lenguajeDe('/tmp/notas.txt')).toBeNull();
		expect(lenguajeDe('/var/log/todo.log')).toBeNull();
		expect(lenguajeDe('/tmp/sin-extension')).toBeNull();
	});

	test('sin archivo no hay lenguaje', () => {
		// Una pestaña nueva, que todavía no tiene ruta.
		expect(lenguajeDe(null)).toBeNull();
	});

	test('la extensión no distingue mayúsculas', () => {
		expect(lenguajeDe('/tmp/LEEME.MD')).toBe('markdown');
	});

	test('un PKGBUILD es shell', () => {
		// Es el archivo que más se edita en este proyecto y no tiene extensión:
		// sin la entrada por nombre se abría sin resaltar nada.
		expect(lenguajeDe('/home/pato/VasakOS/PKGBUILDS/vasak-text/PKGBUILD')).toBe('shell');
	});

	test('el punto que abre un nombre no es una extensión', () => {
		// En `.bashrc` el punto no separa una extensión: tomarlo daría la
		// «extensión» `bashrc`, que no está en ningún mapa, y el archivo se
		// abría sin resaltar aunque sea shell.
		expect(lenguajeDe('/home/pato/.bashrc')).toBe('shell');
		expect(lenguajeDe('/home/pato/.desconocido')).toBeNull();
	});

	test('manda el nombre completo sobre la extensión', () => {
		// `vasak.conf` está en los dos mapas —`conf` es `ini` igual— pero el
		// orden importa para los casos donde no coinciden.
		expect(lenguajeDe('/home/pato/.config/vasak/vasak.conf')).toBe('ini');
	});

	test('el directorio no confunde a la extensión', () => {
		// Un punto en una carpeta y ninguno en el archivo: mirar la ruta entera
		// en lugar del último segmento daba `json` para este caso.
		expect(lenguajeDe('/home/pato/.config/algo.json/archivo')).toBeNull();
	});

	test('las varias extensiones de un mismo lenguaje coinciden', () => {
		expect(lenguajeDe('a.yml')).toBe(lenguajeDe('a.yaml'));
		expect(lenguajeDe('a.md')).toBe(lenguajeDe('a.markdown'));
	});

	test('TypeScript no es JavaScript', () => {
		// Van separados porque se cargan con distinta configuración, y tenerlo
		// decidido en el mapa evita resolverlo en cada lado que lo use.
		expect(lenguajeDe('a.ts')).toBe('typescript');
		expect(lenguajeDe('a.js')).toBe('javascript');
	});
});

describe('los mapas', () => {
	test('las extensiones se escriben sin punto y en minúsculas', () => {
		// Una clave con punto o con mayúscula no coincide nunca, y el síntoma es
		// un archivo que no resalta: no falla nada.
		for (const clave of Object.keys(POR_EXTENSION)) {
			expect(clave).toBe(clave.toLowerCase());
			expect(clave.startsWith('.')).toBe(false);
		}
	});

	test('los nombres completos se escriben en minúsculas', () => {
		// Se comparan contra el nombre pasado a minúsculas, así que una clave
		// con mayúsculas —`PKGBUILD`— no coincidiría nunca.
		for (const clave of Object.keys(POR_NOMBRE)) {
			expect(clave).toBe(clave.toLowerCase());
		}
	});
});
