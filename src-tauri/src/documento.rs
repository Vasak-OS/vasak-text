//! Leer y guardar un archivo de texto **sin cambiarle nada que no se haya pedido**.
//!
//! Es la regla de la que depende todo lo demás: un editor que reformatea al
//! guardar es peor que no tener editor. Alguien abre un `.conf` para cambiar una
//! línea, guarda, y el `git diff` muestra el archivo entero porque se
//! normalizaron los finales de línea. Eso no se nota hasta que ya pasó.
//!
//! Por eso el archivo se recuerda **como estaba** —su fin de línea, si terminaba
//! con salto, si traía marca de orden de bytes— y al guardar se reconstruye
//! igual. Adentro el texto siempre usa `\n`, que es lo que espera el editor; la
//! conversión ocurre en los bordes y está probada de ida y vuelta.
//!
//! **La excepción, que conviene saber antes de encontrarla:** un archivo con
//! finales de línea mezclados se unifica al que predomina. El porqué está en
//! [`fin_de_linea_de`]; en resumen, recordar el de cada línea no sobrevive a que
//! alguien inserte o borre líneas.
//!
//! # Lo que no hace, y por qué
//!
//! **No convierte codificaciones.** Un archivo que no es UTF-8 válido no se
//! abre: se avisa. La alternativa es leerlo con reemplazo de caracteres
//! inválidos, y entonces guardar escribiría rombos `U+FFFD` donde había bytes
//! con información. Perder datos en silencio es peor que no poder abrir.

use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

/// El tope de tamaño para abrir.
///
/// No es una limitación técnica sino la diferencia entre «tarda» y «la ventana
/// se congela»: el texto viaja al WebView por IPC y se rasteriza ahí. Un log de
/// medio giga no es algo que este editor deba intentar, y decirlo es mejor que
/// colgarse.
pub const MAXIMO_BYTES: u64 = 16 * 1024 * 1024;

/// Cuántos bytes se miran para decidir si es binario.
const MUESTRA_BINARIO: usize = 8 * 1024;

/// El fin de línea que tenía el archivo cuando se abrió.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum FinDeLinea {
    Lf,
    Crlf,
}

impl FinDeLinea {
    fn como_texto(self) -> &'static str {
        match self {
            FinDeLinea::Lf => "\n",
            FinDeLinea::Crlf => "\r\n",
        }
    }
}

/// Con qué se compara para saber si el archivo cambió en disco.
///
/// Tamaño y fecha de modificación. No es un hash —leer el archivo entero de
/// nuevo para compararlo cuesta lo mismo que releerlo— y alcanza para el caso
/// real: alguien editó el archivo con otro programa mientras estaba abierto acá.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct Huella {
    pub bytes: u64,
    /// Segundos desde la época. Cero si el sistema de archivos no informa.
    pub modificado: u64,
}

/// Un archivo abierto, tal como está en disco.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
// En `camelCase` para el otro lado: así el tipo de TypeScript es el reflejo
// directo de esta estructura y no hace falta una capa que traduzca nombres,
// que es una capa donde se puede errar un campo sin que nada se queje.
#[serde(rename_all = "camelCase")]
pub struct Documento {
    pub ruta: String,
    /// El texto con `\n`, siempre. Ver el encabezado del módulo.
    pub texto: String,
    pub fin_de_linea: FinDeLinea,
    /// Si el archivo terminaba con un salto de línea.
    ///
    /// Se recuerda porque agregarlo o quitarlo es un cambio que nadie pidió, y
    /// en un `git diff` se ve como una línea modificada.
    pub termina_con_salto: bool,
    pub huella: Huella,
    /// Si el archivo empezaba con la marca de orden de bytes de UTF-8.
    ///
    /// Se recuerda para volver a escribirla. No llega al texto —se vería como un
    /// carácter invisible al principio de la primera línea, y cualquiera lo
    /// borraría sin saber qué era— pero **quitarla al guardar es cambiar el
    /// archivo**: son tres bytes que alguna herramienta del otro lado puede
    /// estar esperando, y nadie pidió que desaparecieran.
    pub bom: bool,
    /// Si el archivo no se puede escribir. La interfaz lo dice antes de que
    /// alguien escriba media pantalla.
    pub solo_lectura: bool,
}

/// Por qué no se pudo abrir.
///
/// Cada variante existe porque tiene una explicación distinta para quien lo
/// intentó: un binario no es un error del programa, y un archivo enorme tampoco.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "clase", content = "detalle", rename_all = "kebab-case")]
pub enum ErrorAlAbrir {
    NoExiste,
    EsUnDirectorio,
    /// Bytes que tiene, para poder decir cuánto.
    DemasiadoGrande(u64),
    Binario,
    /// No es UTF-8 válido: ver el encabezado del módulo.
    NoEsTexto,
    Sistema(String),
}

/// Por qué no se pudo guardar.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "clase", content = "detalle", rename_all = "kebab-case")]
pub enum ErrorAlGuardar {
    /// El archivo cambió en disco desde que se abrió. Lleva la huella nueva
    /// para que la interfaz pueda ofrecer recargar.
    CambioEnDisco(Huella),
    Sistema(String),
}

// ── Las cuentas, que no tocan el disco ──────────────────────────────────────

/// Qué fin de línea usa un texto.
///
/// Gana el que más aparece, y con empate o sin ninguno, `\n`.
///
/// # El archivo mixto se unifica, y es a propósito
///
/// Un archivo mixto existe —los hay con `\r\n` en la cabecera y `\n` en el
/// cuerpo—. Acá se elige **uno** y [`restaurar`] lo aplica a todas las líneas,
/// así que guardar un archivo mixto convierte las líneas minoritarias. Es la
/// única excepción a la regla del módulo, y está elegida sabiendo lo que cuesta:
///
/// La alternativa es recordar el fin de línea de cada línea, y eso no se
/// sostiene en cuanto alguien edita: al insertar o borrar líneas, la lista
/// guardada deja de corresponder con el texto, y no hay forma de saber a qué
/// línea nueva le toca qué. Terminaría conservando finales de línea en lugares
/// que no son los originales, que es peor que unificar: un resultado
/// arbitrario en lugar de uno predecible.
///
/// Así que se unifica y se dice. Un archivo mixto es casi siempre un accidente,
/// y unificarlo suele ser lo que se quiere; lo que no se puede es prometer que
/// no se toca. Ver `un_archivo_mixto_se_unifica_al_guardar`.
pub fn fin_de_linea_de(texto: &str) -> FinDeLinea {
    let crlf = texto.matches("\r\n").count();
    // Los `\n` que no son parte de un `\r\n`.
    let lf = texto.matches('\n').count() - crlf;

    if crlf > lf {
        FinDeLinea::Crlf
    } else {
        FinDeLinea::Lf
    }
}

/// Pasa el texto del archivo al que usa el editor: `\n` y sin salto final.
///
/// Devuelve también lo que hay que recordar para poder devolverlo igual.
pub fn normalizar(bruto: &str) -> (String, FinDeLinea, bool) {
    let fin = fin_de_linea_de(bruto);
    let sin_cr = bruto.replace("\r\n", "\n");
    let termina_con_salto = sin_cr.ends_with('\n');
    // El salto final se saca del texto: si se dejara, el editor mostraría una
    // línea vacía de más al final, y quien la borrara estaría cambiando el
    // archivo sin querer.
    let texto = if termina_con_salto {
        sin_cr[..sin_cr.len() - 1].to_string()
    } else {
        sin_cr
    };

    (texto, fin, termina_con_salto)
}

/// Reconstruye el contenido del archivo desde el del editor.
///
/// Es la inversa exacta de [`normalizar`]: hay un test que lo comprueba de ida y
/// vuelta, porque de eso depende que guardar no ensucie el archivo.
pub fn restaurar(texto: &str, fin: FinDeLinea, termina_con_salto: bool, bom: bool) -> String {
    let mut salida = String::new();
    if bom {
        salida.push('\u{feff}');
    }

    if fin == FinDeLinea::Crlf {
        salida.push_str(&texto.replace('\n', "\r\n"));
    } else {
        salida.push_str(texto);
    }

    if termina_con_salto {
        salida.push_str(fin.como_texto());
    }

    salida
}

/// Si los bytes parecen de un archivo binario.
///
/// Un byte cero es la señal: no aparece en texto y sí en cualquier ejecutable,
/// imagen o base de datos. Se mira sólo el principio porque alcanza y porque
/// recorrer un archivo grande para decidir si no hay que abrirlo es al revés.
pub fn parece_binario(bytes: &[u8]) -> bool {
    bytes.iter().take(MUESTRA_BINARIO).any(|b| *b == 0)
}

// ── Lo que sí toca el disco ─────────────────────────────────────────────────

fn huella_de(metadatos: &std::fs::Metadata) -> Huella {
    let modificado = metadatos
        .modified()
        .ok()
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| d.as_secs())
        .unwrap_or(0);

    Huella {
        bytes: metadatos.len(),
        modificado,
    }
}

/// Abre un archivo para editarlo.
pub fn abrir(ruta: &Path) -> Result<Documento, ErrorAlAbrir> {
    let metadatos = std::fs::metadata(ruta).map_err(|e| match e.kind() {
        std::io::ErrorKind::NotFound => ErrorAlAbrir::NoExiste,
        _ => ErrorAlAbrir::Sistema(e.to_string()),
    })?;

    if metadatos.is_dir() {
        return Err(ErrorAlAbrir::EsUnDirectorio);
    }
    if metadatos.len() > MAXIMO_BYTES {
        return Err(ErrorAlAbrir::DemasiadoGrande(metadatos.len()));
    }

    let bytes = std::fs::read(ruta).map_err(|e| ErrorAlAbrir::Sistema(e.to_string()))?;
    if parece_binario(&bytes) {
        return Err(ErrorAlAbrir::Binario);
    }

    // `from_utf8` y no `from_utf8_lossy`: ver el encabezado del módulo.
    let bruto = String::from_utf8(bytes).map_err(|_| ErrorAlAbrir::NoEsTexto)?;
    // El BOM se saca del texto pero **se recuerda**: fuera del texto para que no
    // se vea como un carácter invisible al principio de la primera línea, y
    // recordado para volver a escribirlo al guardar.
    let con_bom = bruto.starts_with('\u{feff}');
    let bruto = bruto.strip_prefix('\u{feff}').unwrap_or(&bruto);

    let (texto, fin_de_linea, termina_con_salto) = normalizar(bruto);

    Ok(Documento {
        ruta: ruta.to_string_lossy().into_owned(),
        texto,
        fin_de_linea,
        termina_con_salto,
        huella: huella_de(&metadatos),
        bom: con_bom,
        solo_lectura: escritura_negada(ruta, &metadatos),
    })
}

/// Si el archivo no se puede escribir.
///
/// Se prueba abriéndolo para escritura y no leyendo los permisos: el modo no
/// cuenta la historia completa —hay ACL, sistemas de archivos montados de sólo
/// lectura, atributos de inmutabilidad— y lo que importa es la respuesta a la
/// pregunta que se va a hacer al guardar.
fn escritura_negada(ruta: &Path, metadatos: &std::fs::Metadata) -> bool {
    if metadatos.permissions().readonly() {
        return true;
    }
    std::fs::OpenOptions::new().write(true).open(ruta).is_err()
}

/// Guarda el texto en su archivo, conservando lo que el archivo tenía.
///
/// `huella_esperada` es la de cuando se abrió: si el archivo cambió en disco,
/// **no se pisa**. Alguien pudo haberlo editado con otro programa, y sobrescribir
/// eso sin avisar es la peor cosa que puede hacer un editor.
pub fn guardar(
    ruta: &Path,
    texto: &str,
    fin: FinDeLinea,
    termina_con_salto: bool,
    bom: bool,
    huella_esperada: Option<Huella>,
) -> Result<Huella, ErrorAlGuardar> {
    if let (Some(esperada), Ok(metadatos)) = (huella_esperada, std::fs::metadata(ruta)) {
        let actual = huella_de(&metadatos);
        if actual != esperada {
            return Err(ErrorAlGuardar::CambioEnDisco(actual));
        }
    }

    let contenido = restaurar(texto, fin, termina_con_salto, bom);
    escribir_atomico(ruta, contenido.as_bytes()).map_err(|e| ErrorAlGuardar::Sistema(e.to_string()))?;

    let metadatos = std::fs::metadata(ruta).map_err(|e| ErrorAlGuardar::Sistema(e.to_string()))?;
    Ok(huella_de(&metadatos))
}

/// Escribe a un temporal y renombra.
///
/// `std::fs::write` trunca el archivo **antes** de terminar de escribirlo: una
/// interrupción a mitad de camino —el equipo se apaga, el disco se llena— deja
/// el archivo vacío o partido. En un archivo de ajustes eso ya es malo; en el
/// documento de alguien es perder el trabajo.
///
/// El temporal va en el **mismo directorio** porque `rename` sólo es atómico
/// dentro del mismo sistema de archivos, y `/tmp` suele ser otro.
///
/// Los permisos del original se copian al temporal antes de renombrar: sin eso,
/// guardar un archivo de 0600 lo dejaría con los permisos que dicte el umask.
fn escribir_atomico(ruta: &Path, contenido: &[u8]) -> std::io::Result<()> {
    use std::io::Write;

    // El enlace simbólico se sigue hasta el archivo real.
    //
    // `rename` **no** sigue el destino, así que guardar sobre un enlace lo
    // reemplazaba por un archivo común y dejaba el archivo apuntado intacto: la
    // edición parecía funcionar y el archivo que se quería cambiar seguía igual.
    // Es el caso de cualquier configuración enlazada desde un repositorio de
    // dotfiles, que en este sistema es lo habitual.
    //
    // Si la ruta todavía no existe —un «guardar como» a un archivo nuevo—
    // `canonicalize` falla y se usa la ruta tal cual, que es lo correcto.
    let real = std::fs::canonicalize(ruta).unwrap_or_else(|_| ruta.to_path_buf());
    let ruta = real.as_path();

    let directorio = ruta.parent().unwrap_or_else(|| Path::new("."));
    let nombre = ruta
        .file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_else(|| "archivo".to_string());
    let temporal: PathBuf = directorio.join(format!(".{nombre}.vasak-text.{}", std::process::id()));

    let permisos = std::fs::metadata(ruta).ok().map(|m| m.permissions());

    let resultado = (|| -> std::io::Result<()> {
        let mut archivo = crear_temporal(&temporal, permisos.is_some())?;
        archivo.write_all(contenido)?;
        // `sync_all` antes de renombrar: sin esto el rename puede quedar visible
        // con el contenido todavía en el caché, y un corte de energía deja un
        // archivo con el nombre correcto y adentro cualquier cosa.
        archivo.sync_all()?;
        if let Some(permisos) = permisos {
            std::fs::set_permissions(&temporal, permisos)?;
        }
        std::fs::rename(&temporal, ruta)
    })();

    if resultado.is_err() {
        // Que un guardado fallido no deje basura al lado del archivo.
        let _ = std::fs::remove_file(&temporal);
    }

    resultado
}

/// Crea el temporal del guardado atómico.
///
/// `hay_original` decide con qué permisos nace, y la distinción importa:
///
///  - **Si el archivo ya existe**, nace en 0600. `File::create` pide 0666 y deja
///    que el umask lo recorte, o sea 0644 en la práctica: durante el rato que va
///    desde escribir el contenido hasta copiar los permisos del original, el
///    contenido de un archivo de 0600 —una clave, un token— quedaba legible para
///    cualquiera en el mismo directorio. Los permisos del original se aplican
///    unas líneas más abajo, así que el 0600 no queda.
///  - **Si no existe** —un «guardar como» a un archivo nuevo— se deja que decida
///    el umask, que es lo que hace cualquier programa al crear un archivo. Nacer
///    en 0600 y quedarse ahí sería una sorpresa: un script recién guardado que
///    nadie más puede leer.
///
/// Un temporal que quedó de un guardado interrumpido con este mismo PID se pisa:
/// `create_new` fallaría para siempre y dejaría la aplicación sin poder guardar.
fn crear_temporal(temporal: &Path, hay_original: bool) -> std::io::Result<std::fs::File> {
    use std::os::unix::fs::OpenOptionsExt;

    if !hay_original {
        return std::fs::File::create(temporal);
    }

    let mut opciones = std::fs::OpenOptions::new();
    opciones.write(true).create_new(true).mode(0o600);

    match opciones.open(temporal) {
        Err(e) if e.kind() == std::io::ErrorKind::AlreadyExists => {
            std::fs::remove_file(temporal)?;
            opciones.open(temporal)
        }
        otro => otro,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    // ── Ida y vuelta: la propiedad de la que depende no ensuciar archivos ────

    /// Normalizar y restaurar tiene que devolver **exactamente** lo que entró.
    fn ida_y_vuelta(bruto: &str) {
        let (texto, fin, salto) = normalizar(bruto);
        assert_eq!(
            restaurar(&texto, fin, salto, false),
            bruto,
            "no volvió igual: {bruto:?}"
        );
    }

    #[test]
    fn un_archivo_con_lf_vuelve_con_lf() {
        ida_y_vuelta("una\ndos\ntres\n");
        ida_y_vuelta("una\ndos\ntres");
    }

    #[test]
    fn un_archivo_con_crlf_vuelve_con_crlf() {
        // El caso que produce el «cambió el archivo entero» en un diff.
        ida_y_vuelta("una\r\ndos\r\ntres\r\n");
        ida_y_vuelta("una\r\ndos\r\ntres");
    }

    #[test]
    fn el_salto_final_se_conserva_esté_o_no() {
        let (_, _, con) = normalizar("hola\n");
        let (_, _, sin) = normalizar("hola");
        assert!(con);
        assert!(!sin);
    }

    #[test]
    fn un_archivo_vacio_y_uno_de_una_linea_vacia_no_son_lo_mismo() {
        // «» y «\n» son archivos distintos, de un byte de diferencia, y un
        // editor que los confunde agrega o quita una línea al guardar.
        ida_y_vuelta("");
        ida_y_vuelta("\n");
        assert!(!normalizar("").2);
        assert!(normalizar("\n").2);
    }

    #[test]
    fn un_archivo_mixto_conserva_el_que_predomina() {
        // Existen: cabecera con CRLF y cuerpo con LF. Imponer uno reescribe el
        // archivo entero; conservar el que manda deja el diff en lo que se tocó.
        assert_eq!(fin_de_linea_de("a\r\nb\r\nc\nd\r\n"), FinDeLinea::Crlf);
        assert_eq!(fin_de_linea_de("a\nb\nc\r\nd\n"), FinDeLinea::Lf);
    }

    #[test]
    fn sin_ningun_salto_se_usa_lf() {
        assert_eq!(fin_de_linea_de("una sola línea"), FinDeLinea::Lf);
        assert_eq!(fin_de_linea_de(""), FinDeLinea::Lf);
    }

    #[test]
    fn un_cr_solo_no_se_toma_por_fin_de_linea() {
        // Un `\r` suelto en medio del texto es un carácter del contenido, no un
        // salto: convertirlo cambiaría el archivo.
        ida_y_vuelta("progreso\rprogreso\nlisto\n");
    }

    // ── Binarios ────────────────────────────────────────────────────────────

    #[test]
    fn un_byte_cero_delata_un_binario() {
        assert!(parece_binario(b"\x7fELF\x02\x01\x01\x00"));
        assert!(!parece_binario("texto con acentos: ñáé\n".as_bytes()));
    }

    #[test]
    fn un_cero_mas_alla_de_la_muestra_no_se_mira() {
        // Es a propósito: recorrer un archivo de megabytes para decidir si no
        // hay que abrirlo es al revés. Un texto con un cero enterrado se abre.
        let mut bytes = vec![b'a'; MUESTRA_BINARIO + 10];
        bytes[MUESTRA_BINARIO + 5] = 0;
        assert!(!parece_binario(&bytes));
    }

    // ── Disco ───────────────────────────────────────────────────────────────

    fn temporal(nombre: &str, contenido: &[u8]) -> (tempfile::TempDir, PathBuf) {
        let dir = tempfile::tempdir().unwrap();
        let ruta = dir.path().join(nombre);
        std::fs::write(&ruta, contenido).unwrap();
        (dir, ruta)
    }

    #[test]
    fn abrir_y_guardar_sin_tocar_nada_deja_el_archivo_byte_por_byte_igual() {
        // La prueba que resume el módulo.
        for bruto in ["a\r\nb\r\n", "a\nb", "", "\n", "sólo una línea"] {
            let (_dir, ruta) = temporal("archivo.txt", bruto.as_bytes());
            let doc = abrir(&ruta).unwrap();
            guardar(
                &ruta,
                &doc.texto,
                doc.fin_de_linea,
                doc.termina_con_salto,
                doc.bom,
                Some(doc.huella),
            )
            .unwrap();

            assert_eq!(std::fs::read(&ruta).unwrap(), bruto.as_bytes(), "{bruto:?}");
        }
    }

    #[test]
    fn un_archivo_que_cambio_en_disco_no_se_pisa() {
        // El caso real: alguien lo editó con otro programa mientras estaba
        // abierto acá. Sobrescribir eso sin avisar es lo peor que puede hacer
        // un editor.
        let (_dir, ruta) = temporal("archivo.txt", b"original\n");
        let doc = abrir(&ruta).unwrap();

        // Otro programa escribe. Se fuerza una huella distinta por tamaño,
        // porque la fecha tiene resolución de un segundo.
        std::fs::write(&ruta, b"lo que escribio el otro programa\n").unwrap();

        let resultado = guardar(&ruta, "mio", doc.fin_de_linea, true, false, Some(doc.huella));

        assert!(matches!(resultado, Err(ErrorAlGuardar::CambioEnDisco(_))));
        // Y lo del otro programa sigue ahí.
        assert_eq!(
            std::fs::read_to_string(&ruta).unwrap(),
            "lo que escribio el otro programa\n"
        );
    }

    #[test]
    fn sin_huella_esperada_se_guarda_igual() {
        // Es el caso de «guardar como» sobre un archivo que este editor no
        // abrió: no hay nada con qué comparar.
        let (_dir, ruta) = temporal("archivo.txt", b"algo\n");
        assert!(guardar(&ruta, "otro", FinDeLinea::Lf, true, false, None).is_ok());
        assert_eq!(std::fs::read_to_string(&ruta).unwrap(), "otro\n");
    }

    #[test]
    fn guardar_conserva_los_permisos_del_archivo() {
        use std::os::unix::fs::PermissionsExt;

        // Un archivo de 0600 —una clave, un token— no puede quedar en 0644
        // porque se lo editó. El temporal nace con el umask, así que hay que
        // copiarlos antes de renombrar.
        let (_dir, ruta) = temporal("secreto.conf", b"clave\n");
        std::fs::set_permissions(&ruta, std::fs::Permissions::from_mode(0o600)).unwrap();

        guardar(&ruta, "otra clave", FinDeLinea::Lf, true, false, None).unwrap();

        let modo = std::fs::metadata(&ruta).unwrap().permissions().mode() & 0o777;
        assert_eq!(modo, 0o600, "quedó en {modo:o}");
    }

    #[test]
    fn un_guardado_fallido_no_deja_temporales_al_lado() {
        // Un directorio que no se puede escribir: el temporal no se puede crear
        // y no tiene que quedar rastro.
        let dir = tempfile::tempdir().unwrap();
        let ruta = dir.path().join("no-existe").join("archivo.txt");

        assert!(guardar(&ruta, "algo", FinDeLinea::Lf, true, false, None).is_err());
        let sobras: Vec<_> = std::fs::read_dir(dir.path())
            .unwrap()
            .flatten()
            .filter(|e| e.file_name().to_string_lossy().contains("vasak-text"))
            .collect();
        assert!(sobras.is_empty(), "quedaron temporales: {sobras:?}");
    }

    #[test]
    fn un_directorio_no_es_un_documento() {
        let dir = tempfile::tempdir().unwrap();
        assert_eq!(abrir(dir.path()), Err(ErrorAlAbrir::EsUnDirectorio));
    }

    #[test]
    fn un_archivo_que_no_esta_se_dice_como_tal() {
        let dir = tempfile::tempdir().unwrap();
        assert_eq!(
            abrir(&dir.path().join("no-esta.txt")),
            Err(ErrorAlAbrir::NoExiste)
        );
    }

    #[test]
    fn un_binario_no_se_abre() {
        let (_dir, ruta) = temporal("programa", b"\x7fELF\x00\x00\x00");
        assert_eq!(abrir(&ruta), Err(ErrorAlAbrir::Binario));
    }

    #[test]
    fn lo_que_no_es_utf8_no_se_abre_en_lugar_de_mutilarse() {
        // Leerlo con reemplazo dejaría rombos donde había bytes con
        // información, y guardar los escribiría en el archivo.
        let (_dir, ruta) = temporal("latin1.txt", b"a\xf1o 2026\n");
        assert_eq!(abrir(&ruta), Err(ErrorAlAbrir::NoEsTexto));
    }

    #[test]
    fn el_bom_no_llega_al_texto_pero_se_recuerda() {
        // Fuera del texto, porque si llegara se vería como un carácter invisible
        // al principio de la primera línea y cualquiera lo borraría sin saber
        // qué era. Recordado, porque quitarlo al guardar son tres bytes que
        // nadie pidió cambiar.
        let (_dir, ruta) = temporal("con-bom.txt", "\u{feff}hola\n".as_bytes());
        let doc = abrir(&ruta).unwrap();

        assert_eq!(doc.texto, "hola");
        assert!(doc.bom);
    }

    #[test]
    fn guardar_devuelve_el_bom_al_archivo() {
        // El caso que se perdía: abrir un archivo con marca de orden de bytes y
        // guardarlo lo dejaba sin ella.
        let (_dir, ruta) = temporal("con-bom.txt", "\u{feff}hola\n".as_bytes());
        let doc = abrir(&ruta).unwrap();

        guardar(
            &ruta,
            &doc.texto,
            doc.fin_de_linea,
            doc.termina_con_salto,
            doc.bom,
            Some(doc.huella),
        )
        .unwrap();

        assert_eq!(std::fs::read(&ruta).unwrap(), "\u{feff}hola\n".as_bytes());
    }

    #[test]
    fn un_archivo_sin_bom_no_gana_uno() {
        let (_dir, ruta) = temporal("sin-bom.txt", b"hola\n");
        let doc = abrir(&ruta).unwrap();

        assert!(!doc.bom);
        guardar(&ruta, &doc.texto, doc.fin_de_linea, true, doc.bom, None).unwrap();
        assert_eq!(std::fs::read(&ruta).unwrap(), b"hola\n");
    }

    #[test]
    fn un_archivo_mixto_se_unifica_al_guardar() {
        // **Documenta la única excepción del módulo.** Las líneas minoritarias
        // se convierten al fin de línea que predomina. Si esto alguna vez
        // cambia, este test es el que tiene que fallar. El porqué está en
        // `fin_de_linea_de`.
        let (_dir, ruta) = temporal("mixto.txt", b"a\r\nb\r\nc\nd\r\n");
        let doc = abrir(&ruta).unwrap();

        guardar(
            &ruta,
            &doc.texto,
            doc.fin_de_linea,
            doc.termina_con_salto,
            doc.bom,
            Some(doc.huella),
        )
        .unwrap();

        assert_eq!(std::fs::read(&ruta).unwrap(), b"a\r\nb\r\nc\r\nd\r\n");
    }

    #[test]
    fn guardar_sobre_un_enlace_simbolico_escribe_el_archivo_apuntado() {
        // El caso de cualquier configuración enlazada desde un repositorio de
        // dotfiles, que en este sistema es lo habitual: `rename` no sigue el
        // enlace, así que sin resolverlo antes el enlace quedaba reemplazado por
        // un archivo común y el archivo de verdad seguía con su contenido viejo.
        let dir = tempfile::tempdir().unwrap();
        let real = dir.path().join("real.conf");
        let enlace = dir.path().join("enlace.conf");
        std::fs::write(&real, b"viejo\n").unwrap();
        std::os::unix::fs::symlink(&real, &enlace).unwrap();

        guardar(&enlace, "nuevo", FinDeLinea::Lf, true, false, None).unwrap();

        assert_eq!(std::fs::read_to_string(&real).unwrap(), "nuevo\n");
        assert!(
            std::fs::symlink_metadata(&enlace).unwrap().file_type().is_symlink(),
            "el enlace se reemplazó por un archivo común"
        );
    }

    #[test]
    fn un_temporal_que_quedo_de_antes_no_impide_guardar() {
        // `create_new` fallaría para siempre contra un temporal huérfano del
        // mismo PID, dejando la aplicación sin poder guardar ese archivo.
        let (_dir, ruta) = temporal("archivo.txt", b"original\n");
        let huerfano = ruta
            .parent()
            .unwrap()
            .join(format!(".archivo.txt.vasak-text.{}", std::process::id()));
        std::fs::write(&huerfano, b"basura").unwrap();

        guardar(&ruta, "nuevo", FinDeLinea::Lf, true, false, None).unwrap();

        assert_eq!(std::fs::read_to_string(&ruta).unwrap(), "nuevo\n");
        assert!(!huerfano.exists(), "quedó el temporal");
    }

    #[test]
    fn un_archivo_nuevo_no_nace_privado() {
        use std::os::unix::fs::PermissionsExt;

        // El temporal nace en 0600 cuando hay un original del que copiar
        // permisos, pero un «guardar como» a un archivo nuevo tiene que quedar
        // con lo que dicte el umask: un script recién guardado que nadie más
        // puede leer es una sorpresa, no una protección.
        let dir = tempfile::tempdir().unwrap();
        let ruta = dir.path().join("nuevo.sh");

        guardar(&ruta, "#!/bin/sh", FinDeLinea::Lf, true, false, None).unwrap();

        let modo = std::fs::metadata(&ruta).unwrap().permissions().mode() & 0o077;
        assert_ne!(modo, 0, "quedó sin permisos para grupo ni otros");
    }
}
