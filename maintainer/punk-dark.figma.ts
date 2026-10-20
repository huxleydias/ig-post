/**
 * Code Connect: template punk-dark (carrossel Instagram PunkMetrics)
 *
 * Conecta os COMPONENTS do arquivo Figma (social-ai / 📦 Components) aos
 * trechos HTML equivalentes do template templates/punk-dark/slide.html.
 * No Dev Mode, cada component passa a exibir o snippet correspondente.
 *
 * Nota: os frames ig-feed-01..04 (nodes 1-5, 1-31, 1-54, 1-76) são FRAMES,
 * não components: Code Connect não aceita publish neles. O mapeamento
 * frame→layout do deck.json vive em templates/punk-dark/template.json.
 *
 * Publicar de dentro de maintainer/ (exige FIGMA_ACCESS_TOKEN com
 * codeconnect:write no ambiente; veja maintainer/README.md):
 *   npx @figma/code-connect@1 connect publish
 */
import figma, { html } from '@figma/code-connect/html'

// 📦 tag (5:56): pill branca de categoria/tool
figma.connect('https://www.figma.com/design/6sDOmSDlX549cPK9dnEH54/social-ai?node-id=5-56', {
  props: {
    label: figma.string('Label'),
  },
  example: (props) => html`<span class="pill">${props.label}</span>`,
})

// 📦 footer-bar (6:20): card de vidro do rodapé da capa
figma.connect('https://www.figma.com/design/6sDOmSDlX549cPK9dnEH54/social-ai?node-id=6-20', {
  example: () => html`
    <div class="glass footer-card"></div>
    <img class="brand" src="logos/punkmetrics-white.png" />
    <div class="footer-url">www.punkmetrics.com</div>
    <div class="arrow"><!-- svg seta --></div>
    <div class="dots"><span class="dot active"></span><span class="dot"></span></div>
  `,
})

// 📦 cta-card (6:32): card de vidro com a URL do post
figma.connect('https://www.figma.com/design/6sDOmSDlX549cPK9dnEH54/social-ai?node-id=6-32', {
  example: () => html`
    <div class="glass cta-card">
      <div class="link">https://punkmetrics.com/slug-do-post/</div>
    </div>
  `,
})

// 📦 page-indicator (5:78, component set): dots de progresso do carrossel
figma.connect('https://www.figma.com/design/6sDOmSDlX549cPK9dnEH54/social-ai?node-id=5-78', {
  example: () => html`
    <div class="dots">
      <span class="dot active"></span>
      <span class="dot"></span>
      <span class="dot"></span>
      <span class="dot"></span>
    </div>
  `,
})
