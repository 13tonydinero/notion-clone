#!/usr/bin/env bash
# Crea gli archivi da distribuire (con istruzioni di primo avvio) a partire dai binari in release/.
# Uso: npm run package -- --target all && bash scripts/make-archives.sh
set -euo pipefail
cd "$(dirname "$0")/../release"
STAGE=".stage-$(date +%s)"
mkdir "$STAGE"

COMMON='COME SI USA
 1. Avvia il programma: si apre il browser su http://localhost:3000 (se la porta è occupata ne usa un altra: guarda la finestra).
 2. Lascia aperta la finestra nera mentre lavori; per chiudere premi Ctrl+C o chiudi la finestra.
 3. I tuoi dati stanno nella cartella "data" accanto al programma: copiala per fare un backup o per spostarti su un altro computer.

LAVORARE CON UN COLLEGA
 Nella finestra compaiono gli indirizzi di rete (es. http://192.168.1.20:3000). Nell app apri "Condividi": copia il link
 (con l indirizzo di rete) o fai inquadrare il QR code dal telefono. Collega e telefono devono essere sulla stessa Wi-Fi.
 Per usarlo via internet pubblica l app su un server (vedi README del progetto).

OPZIONI (variabili d ambiente)
 PORT=4000           cambia porta          APP_PASSWORD=xxx    richiede una password per sincronizzare
 NO_BROWSER=1        non apre il browser   ANTHROPIC_API_KEY   abilita l assistente AI online (Claude)
 DATA_DIR=percorso   cartella dei dati'

link() { ln "$1" "$2" 2>/dev/null || cp "$1" "$2"; }

if [ -f notion-clone-win-x64.exe ]; then
  d="$STAGE/win"; mkdir -p "$d"; link notion-clone-win-x64.exe "$d/NotionClone.exe"
  printf 'NOTION CLONE per Windows\r\n\r\nPRIMO AVVIO\r\n Fai doppio clic su NotionClone.exe. Se Windows mostra "Windows ha protetto il PC" (il programma non è firmato\r\n digitalmente): clicca "Ulteriori informazioni" e poi "Esegui comunque". Se compare l avviso del Firewall, consenti\r\n l accesso alle reti private (serve a colleghi e telefono per collegarsi).\r\n\r\n%s\r\n' "$COMMON" | sed 's/\r\?$/\r/' > "$d/LEGGIMI.txt"
  (cd "$d" && zip -q -9 "../../Notion-Clone-Windows-x64.zip" NotionClone.exe LEGGIMI.txt)
fi

for arch in arm64 x64; do
  [ -f "notion-clone-darwin-$arch" ] || continue
  d="$STAGE/mac-$arch"; mkdir -p "$d"; link "notion-clone-darwin-$arch" "$d/notion-clone"
  cat > "$d/Avvia Notion Clone.command" <<'EOS'
#!/bin/bash
# Doppio clic per avviare. Al primo avvio sblocca e firma localmente il programma (necessario su macOS).
cd "$(dirname "$0")" || exit 1
xattr -dr com.apple.quarantine ./notion-clone 2>/dev/null
codesign --sign - --force ./notion-clone 2>/dev/null
exec ./notion-clone
EOS
  chmod +x "$d/Avvia Notion Clone.command" "$d/notion-clone"
  printf 'NOTION CLONE per macOS (%s)\n\nPRIMO AVVIO\n Fai doppio clic su "Avvia Notion Clone.command". Se macOS lo blocca: tasto destro sul file > Apri > Apri.\n (Da Terminale: codesign --sign - notion-clone && ./notion-clone)\n Il programma non è firmato da uno sviluppatore Apple: la firma "ad hoc" viene creata sul tuo Mac dallo script.\n\n%s\n' "$arch" "$COMMON" > "$d/LEGGIMI.txt"
  tar -czf "Notion-Clone-macOS-$arch.tar.gz" -C "$d" .
done

for arch in x64 arm64; do
  [ -f "notion-clone-linux-$arch" ] || continue
  d="$STAGE/linux-$arch"; mkdir -p "$d"; link "notion-clone-linux-$arch" "$d/notion-clone"; chmod +x "$d/notion-clone"
  printf 'NOTION CLONE per Linux (%s)\n\nPRIMO AVVIO\n Da terminale:  ./notion-clone   (se serve: chmod +x notion-clone)\n\n%s\n' "$arch" "$COMMON" > "$d/LEGGIMI.txt"
  tar -czf "Notion-Clone-Linux-$arch.tar.gz" -C "$d" .
done
echo "Archivi creati in release/ (la cartella temporanea $STAGE contiene solo collegamenti e può essere eliminata)."
