import { GuidaSezione, RimandoGuida, VoceGuida } from "./guida-sezione";

/**
 * Le guide delle sezioni del desk, una funzione per sezione.
 *
 * Stanno tutte qui e non dentro le rispettive pagine per una ragione sola: si
 * leggono meglio di fila. Sono il patto che il desk fa con chi lo usa — cosa
 * ogni sezione risponde e cosa NON risponde — e vederle una sotto l'altra è
 * l'unico modo di accorgersi se due sezioni promettono la stessa cosa o se una
 * promette qualcosa che non mantiene.
 *
 * Driver e Stagionalità NON sono qui: hanno già la loro chiave di lettura
 * sopra ciascun grafico.
 */

/** Trends — le serie macro che alimentano il bias. */
export function GuidaTrends() {
  return (
    <GuidaSezione richiamo="è contesto di fondo, non un segnale di giornata">
      <p>
        Le serie economiche che stanno <strong>dietro</strong> ai movimenti di
        oro, petrolio e indici. Si guardano per capire in che regime si sta
        operando, non per decidere l&apos;operazione di oggi: cambiano una volta
        al mese, non una volta al giorno.
      </p>

      <VoceGuida titolo="Il valore di oggi e la sua data">
        Ogni serie porta la data della propria osservazione, e non è la stessa
        per tutte: il PCE esce mensile e con settimane di ritardo, i tassi sono
        giornalieri. Un numero «di oggi» qui può essere di due mesi fa, ed è
        scritto accanto.
      </VoceGuida>

      <VoceGuida titolo="Le revisioni">
        I valori sono quelli che FRED pubblica adesso, revisioni incluse: per
        payroll, PIL e JOLTS il trend e le etichette possono cambiare{" "}
        <strong>retroattivamente</strong> senza che esca un dato nuovo. Non è un
        difetto della pagina, è come funzionano quelle serie.
      </VoceGuida>

      <VoceGuida titolo="Il chip «ciclo»">
        Compare solo dove il trend è dimostrato. Con un trend laterale la
        direzione del quadrante è indistinguibile dal rumore, e mostrarla
        sarebbe precisione che i dati non hanno.
      </VoceGuida>

      <RimandoGuida />
    </GuidaSezione>
  );
}

/** Report — l'archivio della research. */
export function GuidaReport() {
  return (
    <GuidaSezione richiamo="è research scritta a mano, non dati misurati">
      <p>
        Qui non si consulta, si <strong>legge</strong>. Ogni riga è un report
        ricevuto, con il bias dichiarato per oro, WTI e indici e la confidenza
        che il report stesso si attribuisce.
      </p>

      <VoceGuida titolo="Si legge in verticale">
        La stessa colonna, giorno dopo giorno, dice se un bias è stabile o se
        cambia a ogni report. È la sola cosa che uno storico può dire, ed è il
        motivo per cui adesso è una tabella e non un elenco di schede.
      </VoceGuida>

      <VoceGuida titolo="La confidenza non è una misura">
        È dichiarata da chi scrive il report. Se i bias ci prendano o no lo dice
        la <strong>Scorecard</strong>, che è un consuntivo in Expected Move e
        misura gli esiti invece di raccogliere le intenzioni.
      </VoceGuida>

      <VoceGuida titolo="Se un numero diverge">
        Un report è più vecchio dell&apos;archivio e trascritto a mano. Quando
        cita un valore che le sezioni di dati mostrano diverso,{" "}
        <strong>vince l&apos;archivio</strong>.
      </VoceGuida>

      <RimandoGuida />
    </GuidaSezione>
  );
}

/** Scorecard — il consuntivo degli esiti. */
export function GuidaScorecard() {
  return (
    <GuidaSezione richiamo="misura gli esiti passati, non suggerisce il prossimo">
      <p>
        Risponde a una domanda sola: <strong>i bias ci prendono?</strong> Ogni
        settimana chiusa viene misurata in <strong>Expected Move</strong> — cioè
        in multipli del movimento che il mercato si aspettava — così settimane
        calme e settimane mosse si confrontano sulla stessa scala.
      </p>

      <VoceGuida titolo="Perché in Expected Move e non in percentuale">
        Un +2% in una settimana da 1% atteso e un +2% in una settimana da 4%
        atteso non sono lo stesso risultato. La percentuale li fa sembrare
        uguali, l&apos;Expected Move no.
      </VoceGuida>

      <VoceGuida titolo="MFE e MAE">
        Il massimo a favore e il massimo contro raggiunti durante la settimana.
        Un esito positivo con un MAE grande è stato pagato caro: la chiusura da
        sola non racconta quanto la posizione è stata scomoda.
      </VoceGuida>

      <VoceGuida titolo="Si guarda una volta al mese">
        È un consuntivo, non un cruscotto. Guardarlo ogni mattina significa
        leggere rumore: le settimane sono poche e una di più non cambia il
        quadro.
      </VoceGuida>

      <RimandoGuida />
    </GuidaSezione>
  );
}

/** Radar — il registro delle regole. */
export function GuidaRadar() {
  return (
    <GuidaSezione richiamo="guarda le regole dentro cui si opera, non i prezzi">
      <p>
        È l&apos;unica sezione che non guarda il mercato. Registra cosa è
        cambiato nell&apos;<strong>ecosistema</strong> in cui si opera: borse,
        prop firm, broker, regolatori, piattaforme, fonti dati.{" "}
        <strong>Fatti e fonti</strong>: qui non si stima e non si giudica.
      </p>

      <VoceGuida titolo="«Fonte non letta» non vuol dire «nessuna novità»">
        Vuol dire che di quell&apos;area, quella settimana, non si sa nulla —
        perché la fonte non era enumerabile. Può comunque portare una voce nel
        registro: qualcosa è stato trovato, ma senza poter guardare
        l&apos;elenco completo.
      </VoceGuida>

      <VoceGuida titolo="«Cosa fare»">
        Compare solo dove il cambiamento porta un&apos;azione conseguente per
        chi opera. Dove non c&apos;è, il cambiamento è registrato e basta: non
        ogni notizia richiede di fare qualcosa.
      </VoceGuida>

      <VoceGuida titolo="«In vigore dal» e «annunciato il»">
        Sono due date diverse e servono a due cose diverse. Quella che conta per
        operare è la prima; quando manca è scritto{" "}
        <strong>non dichiarata</strong>, invece di essere sostituita con la
        seconda.
      </VoceGuida>

      <RimandoGuida />
    </GuidaSezione>
  );
}

/** Calendario — gli eventi in arrivo, col loro consenso. */
export function GuidaCalendario() {
  return (
    <GuidaSezione richiamo="dice quando esce un dato e rispetto a cosa verrà misurato">
      <p>
        Cosa esce, <strong>a che ora</strong>, e rispetto a quale attesa il
        mercato lo giudicherà. Non dice come reagiranno i prezzi: dice dove
        stanno le ore in cui la volatilità ha una ragione nota per esserci, e
        serve a decidere se stare fermi o se ridurre size prima di
        un&apos;uscita.
      </p>

      <VoceGuida titolo="Il consenso, e perché la colonna è quasi sempre vuota">
        Il consenso è la <strong>media delle attese</strong> degli analisti
        censiti prima dell&apos;uscita. Non è una previsione della fonte né
        nostra: è il metro rispetto a cui si misura la sorpresa. È vuoto sugli
        eventi lontani perché è un <strong>sondaggio</strong>, e il sondaggio
        esce pochi giorni prima del dato — oltre i sei giorni non esiste
        praticamente mai. Per questo la cella dice «non pubblicato» e non «—»:
        il vuoto è un fatto della fonte, non un buco nostro.
      </VoceGuida>

      <VoceGuida titolo="L'importanza">
        È il pallino davanti al nome, ed è quella <strong>dichiarata dalla
        fonte</strong>: pieno alta, mezzo media, vuoto bassa. Riguarda quanto
        l&apos;indicatore è seguito, non quanto il prezzo si muoverà. Il filtro
        parte da «Solo alta» perché è la lista che si guarda la mattina; «Tutte»
        serve quando si cerca un dato preciso.
      </VoceGuida>

      <VoceGuida titolo="Le unità, e perché sono attaccate a ogni numero">
        Nella stessa colonna convivono un tasso d&apos;inflazione, un conteggio
        di posti di lavoro e un saldo commerciale in miliardi. Ogni valore
        porta la sua unità e la sua scala (<strong>K</strong> migliaia,{" "}
        <strong>M</strong> milioni, <strong>B</strong> miliardi) perché
        incolonnare tre grandezze diverse senza dirlo inviterebbe a un
        confronto che non esiste.
      </VoceGuida>

      <VoceGuida titolo="Da dove vengono i numeri">
        Il calendario è di <strong>TradingView</strong>, letto al momento e non
        conservato: la banda in cima dice di quanti minuti fa è la lettura. Ma
        il numero lo pubblica l&apos;istituto che lo produce — Bureau of Labor
        Statistics, BCE, Eurostat — ed è quello linkato sul nome
        dell&apos;evento. Gli orari sono nel tuo fuso, come nel resto
        dell&apos;applicazione.
      </VoceGuida>

      <RimandoGuida />
    </GuidaSezione>
  );
}
