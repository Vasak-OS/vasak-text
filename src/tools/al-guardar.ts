/**
 * Los dos arreglos opcionales que se hacen al guardar.
 *
 * **Apagados por omisión, y eso es la decisión importante.** Quitar espacios
 * finales y agregar el salto de la última línea son mejoras reales, pero son
 * cambios que nadie pidió: si estuvieran prendidos de fábrica, abrir un archivo
 * ajeno para tocar una línea dejaría un `git diff` con la mitad del archivo
 * marcada. Ver el encabezado de `documento.rs`, que es la misma regla.
 *
 * Están acá y no en Rust porque son una preferencia de quien edita, y porque así
 * son una función pura sobre una cadena: lo que se puede probar sin escribir
 * ningún archivo, conviene poder probarlo sin escribir ningún archivo.
 */

export interface OpcionesAlGuardar {
	quitarEspaciosFinales: boolean;
	agregarSaltoFinal: boolean;
}

export const OPCIONES_POR_OMISION: OpcionesAlGuardar = {
	quitarEspaciosFinales: false,
	agregarSaltoFinal: false,
};

/**
 * Prepara el texto para escribirlo.
 *
 * Devuelve el texto —siempre con `\n`, como lo maneja el editor— y si hay que
 * escribir el salto final. Son dos cosas porque el salto final no vive en el
 * texto: lo agrega Rust al reconstruir el archivo con su fin de línea.
 */
export function preparar(
	texto: string,
	terminaConSalto: boolean,
	opciones: OpcionesAlGuardar
): { texto: string; terminaConSalto: boolean } {
	let salida = texto;

	if (opciones.quitarEspaciosFinales) {
		salida = sinEspaciosFinales(salida);
	}

	return {
		texto: salida,
		// Sólo se **agrega**: un archivo que no lo tenía lo gana, y uno que ya lo
		// tenía lo conserva. Lo que esta opción no hace nunca es quitarlo, que
		// sería el cambio destructivo del par.
		terminaConSalto: opciones.agregarSaltoFinal ? true : terminaConSalto,
	};
}

/**
 * Quita los espacios y tabuladores al final de cada línea.
 *
 * Línea por línea y no con una expresión sobre todo el texto, porque `\s` en una
 * expresión regular también alcanza a `\n`: `/\s+$/gm` con la bandera multilínea
 * funciona, pero `/\s+$/g` colapsaría las líneas vacías del final del archivo en
 * una sola. Partir y volver a unir no tiene esa trampa.
 */
function sinEspaciosFinales(texto: string): string {
	return texto
		.split('\n')
		.map((linea) => linea.replace(/[ \t]+$/, ''))
		.join('\n');
}
