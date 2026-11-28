<script setup lang="ts">
/**
 * Biblioteca de recursos de marketing.
 *
 * ## As três versões anteriores e por que caíram
 *
 * 1. **Grade de cartões iguais.** Setenta retângulos com título, duas etiquetas
 *    e dois blocos de texto. Nada tinha mais peso que nada e o olho não tinha
 *    onde pousar.
 * 2. **Lista nua.** Resolveu a varredura, mas a página virou um extrato: fria,
 *    sem hierarquia visível entre um grupo e o seguinte.
 * 3. **Lista com acento do tema.** O `--accent` é configurável e, no ciano,
 *    ficava neon sobre fundo claro. Chamava atenção sem dizer nada.
 *
 * ## O que esta versão faz de diferente
 *
 * - **O calor vem do laranja da marca**, não do acento do tema. E nunca puro:
 *   `--calor-texto` mistura o laranja com o texto, então escurece no tema claro
 *   e clareia no escuro. É o que mantém contraste de leitura nos dois.
 * - **Cada categoria é um painel fechado.** A borda e o fundo um passo acima do
 *   fundo da página dizem onde um assunto termina e outro começa. Fio de 1px
 *   solto não dava esse limite.
 * - **A primeira coisa da página é uma pergunta, não um filtro.** Quem chega
 *   não sabe o nome da ferramenta; sabe a tarefa que precisa fazer. Os atalhos
 *   de tarefa são a porta de entrada, e o menu de categoria fica para quem já
 *   sabe onde procurar.
 * - **O logo de cada ferramenta aparece.** É o que faz reconhecer o CapCut
 *   antes de ler a palavra.
 * - **Cor de alerta só onde há risco de licença.** "Uso livre" é o esperado e
 *   fica discreto.
 */
import { computed, ref } from 'vue'
import {
  ArrowUpRight,
  Box,
  Clapperboard,
  Globe,
  History,
  Image as ImageIcon,
  Map as MapIcon,
  Music,
  Palette,
  PenTool,
  Scissors,
  Search,
  Shapes,
  ShieldCheck,
  Smartphone,
  Sparkles,
  SquareStack,
  Wand2,
  Wrench,
  X,
} from 'lucide-vue-next'
import type { Component } from 'vue'
import {
  CATEGORIAS,
  CHECKLIST,
  LICENCAS,
  MUDOU,
  RECURSOS,
  type Categoria,
  type Recurso,
} from './marketing-resources'

/** Ícone por categoria. Apresentação fica aqui; os dados seguem texto puro. */
const ICONES: Record<Categoria, Component> = {
  video: Clapperboard,
  imagem: ImageIcon,
  edicao: Scissors,
  apresentacao: SquareStack,
  mockup: Smartphone,
  musica: Music,
  motion: Sparkles,
  ilustracao: PenTool,
  icones: Shapes,
  cor: Palette,
  utilitario: Wrench,
  quadro: MapIcon,
  '3d': Box,
  site: Globe,
  ia: Wand2,
}

/**
 * Atalhos por TAREFA, não por categoria.
 *
 * Quem abre a biblioteca não pensa "quero a categoria mockup"; pensa "preciso
 * mostrar o app numa tela de celular". A frase é o que a pessoa diria em voz
 * alta, e o clique leva para a prateleira certa.
 */
const ATALHOS: { frase: string; cat: Categoria }[] = [
  { frase: 'Cortar e legendar um vídeo', cat: 'edicao' },
  { frase: 'Achar foto que posso publicar', cat: 'imagem' },
  { frase: 'Montar uma apresentação', cat: 'apresentacao' },
  { frase: 'Achar trilha sem dor de cabeça', cat: 'musica' },
  { frase: 'Mostrar o app numa tela', cat: 'mockup' },
  { frase: 'Gerar imagem ou vídeo com IA', cat: 'ia' },
  { frase: 'Publicar uma landing page', cat: 'site' },
]

const busca = ref('')
const categoria = ref<Categoria | 'todas'>('todas')
const soLivres = ref(false)
/** Linha aberta: o detalhe é de decisão, e só uma interessa por vez. */
const aberto = ref<string | null>(null)

const normalizar = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')

const filtrados = computed(() => {
  const termo = normalizar(busca.value.trim())
  return RECURSOS.filter((r) => {
    if (categoria.value !== 'todas' && r.categoria !== categoria.value) return false
    if (soLivres.value && r.licenca !== 'livre') return false
    if (!termo) return true
    return normalizar(`${r.nome} ${r.paraQue} ${r.forte}`).includes(termo)
  })
})

const grupos = computed(() =>
  CATEGORIAS.map((c) => ({
    ...c,
    itens: filtrados.value.filter((r) => r.categoria === c.id).sort((a, b) => a.tier - b.tier),
  })).filter((g) => g.itens.length),
)

/**
 * A recomendação da categoria: o primeiro item do tier 1.
 *
 * Marcar todo tier 1 não recomendava nada — metade da lista ficava com selo e o
 * selo virava decoração. Um por categoria responde a pergunta real de quem
 * chega sem saber: "se eu não entendo do assunto, qual eu abro?".
 */
const recomendado = computed(() => {
  const mapa = new Map<Categoria, string>()
  for (const g of grupos.value) {
    const primeiro = g.itens.find((r) => r.tier === 1)
    if (primeiro) mapa.set(g.id, primeiro.nome)
  }
  return mapa
})

/** Contagem por categoria para o menu, independente do filtro de texto. */
const contagem = computed(() => {
  const mapa = new Map<Categoria, number>()
  for (const r of RECURSOS) mapa.set(r.categoria, (mapa.get(r.categoria) ?? 0) + 1)
  return mapa
})

const totalLivres = computed(() => RECURSOS.filter((r) => r.licenca === 'livre').length)
const temFiltro = computed(
  () => !!busca.value.trim() || categoria.value !== 'todas' || soLivres.value,
)

function limpar() {
  busca.value = ''
  categoria.value = 'todas'
  soLivres.value = false
}

/** Clicar no atalho já aberto volta para tudo: o chip funciona como interruptor. */
const irPara = (cat: Categoria) => {
  categoria.value = categoria.value === cat ? 'todas' : cat
  busca.value = ''
}

/**
 * Logo da ferramenta pelo favicon do próprio domínio.
 *
 * Serviço do Google porque ele resolve redirecionamento e tamanho sozinho; só o
 * DOMÍNIO sai daqui, nada sobre quem está olhando. Quando falha, a inicial entra
 * no lugar, então a lista nunca fica com buraco.
 */
const logo = (r: Recurso) =>
  `https://www.google.com/s2/favicons?sz=64&domain=${new URL(r.url).hostname}`

const semLogo = ref(new Set<string>())
const falhou = (nome: string) => {
  const proximo = new Set(semLogo.value)
  proximo.add(nome)
  semLogo.value = proximo
}

const abrir = (r: Recurso) => window.open(r.url, '_blank', 'noopener,noreferrer')
const alternar = (nome: string) => (aberto.value = aberto.value === nome ? null : nome)
</script>

<template>
  <div class="biblio">
    <header v-reveal="0" class="topo">
      <div class="topo-texto">
        <p class="topo-olho">Biblioteca de recursos</p>
        <h1>O que você precisa fazer hoje?</h1>
        <p class="topo-frase">
          Vídeo, foto, trilha, mockup e ferramenta de IA, em um lugar só. Cada item diz se você
          pode publicar, se precisa creditar alguém e quanto custa.
        </p>
      </div>

      <div class="topo-numero">
        <strong>{{ RECURSOS.length }}</strong>
        <span>ferramentas<br />conferidas</span>
      </div>
    </header>

    <!-- A tarefa vem antes do filtro: é assim que a pessoa pensa ao chegar. -->
    <div v-reveal="1" class="atalhos">
      <button
        v-for="a in ATALHOS"
        :key="a.frase"
        type="button"
        class="atalho"
        :class="{ 'atalho--on': categoria === a.cat }"
        @click="irPara(a.cat)"
      >
        <component :is="ICONES[a.cat]" :size="17" aria-hidden="true" />
        <span>{{ a.frase }}</span>
      </button>
    </div>

    <div class="corpo">
      <aside v-reveal="2" class="lado">
        <label class="campo">
          <Search :size="16" aria-hidden="true" />
          <input
            v-model="busca"
            type="search"
            placeholder="Buscar ferramenta"
            aria-label="Buscar recurso"
          />
          <button
            v-if="busca"
            type="button"
            class="campo-x"
            aria-label="Limpar busca"
            @click="busca = ''"
          >
            <X :size="14" />
          </button>
        </label>

        <button
          type="button"
          class="livre"
          :class="{ 'livre--on': soLivres }"
          :aria-pressed="soLivres"
          @click="soLivres = !soLivres"
        >
          <ShieldCheck :size="16" aria-hidden="true" />
          <span>Uso livre, sem crédito</span>
          <span class="livre-num">{{ totalLivres }}</span>
        </button>

        <nav class="menu" aria-label="Categorias">
          <button
            type="button"
            class="menu-item"
            :class="{ 'menu-item--on': categoria === 'todas' }"
            @click="categoria = 'todas'"
          >
            <span class="menu-nome">Tudo</span>
            <span class="menu-num">{{ RECURSOS.length }}</span>
          </button>
          <button
            v-for="c in CATEGORIAS"
            :key="c.id"
            type="button"
            class="menu-item"
            :class="{ 'menu-item--on': categoria === c.id }"
            @click="categoria = c.id"
          >
            <component :is="ICONES[c.id]" :size="15" aria-hidden="true" />
            <span class="menu-nome">{{ c.nome }}</span>
            <span class="menu-num">{{ contagem.get(c.id) }}</span>
          </button>
        </nav>

        <button v-if="temFiltro" type="button" class="limpar" @click="limpar">
          Limpar filtros
        </button>
      </aside>

      <!--
        O `v-reveal` fica no container, NÃO em cada painel.

        Por painel, cada filtro remontava as seções: a diretiva escondia tudo de
        novo e o IntersectionObserver não reemitia para um nó que já estava em
        vista, então ligar e desligar "posso usar sem creditar" deixava a lista
        inteira em opacity 0. Além disso, reanimar a cada tecla digitada é
        errado por si só: a entrada é da tela, não do resultado da busca.
      -->
      <main v-reveal="3" class="lista">
        <p v-if="!grupos.length" class="vazio">
          Nada encontrado. Tente outra palavra ou tire o filtro.
        </p>

        <!-- Cada categoria é um painel fechado: o limite entre assuntos é visível. -->
        <section v-for="grupo in grupos" :key="grupo.id" class="painel">
          <header class="painel-topo">
            <span class="painel-icone" aria-hidden="true">
              <component :is="ICONES[grupo.id]" :size="18" />
            </span>
            <span class="painel-texto">
              <h2>{{ grupo.nome }}</h2>
              <span class="painel-desc">{{ grupo.descricao }}</span>
            </span>
            <span class="painel-num">{{ grupo.itens.length }}</span>
          </header>

          <ul class="itens">
            <li
              v-for="r in grupo.itens"
              :key="r.nome"
              class="item"
              :class="{ 'item--aberto': aberto === r.nome }"
            >
              <button
                type="button"
                class="linha"
                :aria-expanded="aberto === r.nome"
                @click="alternar(r.nome)"
              >
                <img
                  v-if="!semLogo.has(r.nome)"
                  :src="logo(r)"
                  alt=""
                  class="marca"
                  loading="lazy"
                  @error="falhou(r.nome)"
                />
                <span v-else class="marca marca--letra" aria-hidden="true">{{ r.nome[0] }}</span>

                <span class="linha-texto">
                  <span class="linha-nome">
                    {{ r.nome }}
                    <span v-if="recomendado.get(r.categoria) === r.nome" class="essencial">
                      comece por aqui
                    </span>
                  </span>
                  <span class="linha-para">{{ r.paraQue }}</span>
                </span>

                <span class="linha-fim">
                  <span class="licenca" :class="`licenca--${LICENCAS[r.licenca].tom}`">
                    {{ LICENCAS[r.licenca].rotulo }}
                  </span>
                  <span class="preco">{{ r.preco }}</span>
                </span>
              </button>

              <div v-if="aberto === r.nome" class="detalhe">
                <p class="detalhe-licenca">{{ LICENCAS[r.licenca].explicacao }}</p>
                <div class="detalhe-notas">
                  <p><b>O que é bom</b>{{ r.forte }}</p>
                  <p><b>O que não é</b>{{ r.fraco }}</p>
                </div>
                <p v-if="r.atencao" class="detalhe-aviso">{{ r.atencao }}</p>
                <button type="button" class="ir" @click.stop="abrir(r)">
                  Abrir {{ r.nome }}
                  <ArrowUpRight :size="15" aria-hidden="true" />
                </button>
              </div>
            </li>
          </ul>
        </section>

        <!-- Quem cita uma ferramenta de reunião antiga precisa saber o que morreu. -->
        <section v-if="!temFiltro" class="painel painel--mudou">
          <header class="painel-topo">
            <span class="painel-icone" aria-hidden="true"><History :size="18" /></span>
            <span class="painel-texto">
              <h2>O que mudou</h2>
              <span class="painel-desc">O que saiu do ar ou mudou de dono, e para onde a gente foi</span>
            </span>
          </header>
          <ul class="mudou">
            <li v-for="m in MUDOU" :key="m.nome">
              <b>{{ m.nome }}</b>
              <span>{{ m.oQueAconteceu }}</span>
              <span class="mudou-troca">Use no lugar: {{ m.noLugar }}</span>
            </li>
          </ul>
        </section>

        <section class="painel painel--check">
          <header class="painel-topo">
            <span class="painel-icone" aria-hidden="true"><ShieldCheck :size="18" /></span>
            <span class="painel-texto">
              <h2>Antes de publicar</h2>
              <span class="painel-desc">Cinco conferências que evitam o erro caro</span>
            </span>
          </header>
          <ol class="check">
            <li v-for="(passo, i) in CHECKLIST" :key="passo.titulo">
              <span class="check-num">{{ i + 1 }}</span>
              <span>
                <b>{{ passo.titulo }}</b>
                <span>{{ passo.detalhe }}</span>
              </span>
            </li>
          </ol>
        </section>
      </main>
    </div>
  </div>
</template>

<style scoped>
/*
 * O calor desta tela sai do laranja da marca, nunca do `--accent` do tema (que
 * é configurável e, no ciano, vira neon sobre fundo claro).
 *
 * `--calor-texto` mistura o laranja com `--text`: no tema claro o texto é quase
 * preto e a mistura ESCURECE o laranja; no escuro é quase branco e CLAREIA. É o
 * que mantém contraste de leitura nos dois sem escrever dois valores.
 */
.biblio {
  --calor: var(--brand-accent);
  --calor-texto: color-mix(in srgb, var(--brand-accent) 72%, var(--text));
  --calor-fio: color-mix(in srgb, var(--brand-accent) 28%, var(--border));
  --calor-tinta: color-mix(in srgb, var(--brand-accent) 9%, var(--surface));
  padding: 24px 28px 64px;
  max-width: 1720px;
  margin: 0;
}

/* ─── Cabeçalho ─────────────────────────────────────────────────────────── */
.topo {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 28px;
  padding: 26px 28px 24px;
  border: 1px solid var(--calor-fio);
  border-radius: 18px;
  background: linear-gradient(135deg, var(--calor-tinta), var(--surface) 72%);
}

.topo-texto {
  min-width: 0;
}

.topo-olho {
  margin: 0 0 6px;
  color: var(--calor-texto);
  font-size: 0.75rem;
  font-weight: 700;
  letter-spacing: 0.02em;
}

.topo h1 {
  margin: 0;
  color: var(--text);
  font-size: 2.125rem;
  font-weight: 700;
  letter-spacing: -0.028em;
  line-height: 1.12;
}

.topo-frase {
  margin: 12px 0 0;
  max-width: 62ch;
  color: var(--text-2);
  font-size: 0.9375rem;
  line-height: 1.65;
}

.topo-numero {
  flex: none;
  display: flex;
  align-items: baseline;
  gap: 10px;
  padding-top: 6px;
}

.topo-numero strong {
  color: var(--calor-texto);
  font-size: 3.25rem;
  font-weight: 700;
  line-height: 1;
  letter-spacing: -0.04em;
  font-variant-numeric: tabular-nums;
}

.topo-numero span {
  color: var(--text-3);
  font-size: 0.8125rem;
  line-height: 1.35;
}

/* ─── Atalhos por tarefa ────────────────────────────────────────────────── */
.atalhos {
  display: flex;
  flex-wrap: wrap;
  gap: 9px;
  margin: 18px 0 24px;
}

.atalho {
  display: inline-flex;
  align-items: center;
  gap: 9px;
  min-height: 44px;
  padding: 0 15px;
  border: 1px solid var(--border);
  border-radius: 999px;
  background: var(--surface);
  color: var(--text-2);
  font-family: inherit;
  font-size: 0.875rem;
  font-weight: 550;
  cursor: pointer;
  transition:
    border-color var(--motion-fast) var(--motion-ease),
    background var(--motion-fast) var(--motion-ease),
    transform var(--motion-fast) var(--motion-ease);
}

.atalho svg {
  color: var(--text-4);
  transition: color var(--motion-fast) var(--motion-ease);
}

.atalho:hover {
  border-color: var(--calor-fio);
  background: var(--calor-tinta);
  color: var(--text);
  transform: translateY(-1px);
}

.atalho:hover svg {
  color: var(--calor-texto);
}

.atalho--on {
  border-color: var(--calor-fio);
  background: var(--calor-tinta);
  color: var(--calor-texto);
  font-weight: 650;
}

.atalho--on svg {
  color: var(--calor-texto);
}

/* ─── Estrutura ─────────────────────────────────────────────────────────── */
.corpo {
  display: grid;
  grid-template-columns: 252px minmax(0, 1fr);
  gap: 26px;
  align-items: start;
}

/* Card também aqui: com a direita toda em painel, a lateral solta parecia
   sobra de página em vez de controle. */
.lado {
  position: sticky;
  top: 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px;
  border: 1px solid var(--border);
  border-radius: 16px;
  background: var(--surface);
  box-shadow: var(--shadow-raised);
}

.campo {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 12px;
  min-height: 42px;
  border: 1px solid var(--border);
  border-radius: 11px;
  background: var(--surface-2);
  color: var(--text-4);
}

.campo:focus-within {
  border-color: var(--calor-fio);
}

.campo input {
  flex: 1;
  min-width: 0;
  border: none;
  background: transparent;
  color: var(--text);
  font-family: inherit;
  font-size: 0.875rem;
  outline: none;
}

.campo-x {
  display: grid;
  place-items: center;
  width: 20px;
  height: 20px;
  border: none;
  border-radius: 999px;
  background: var(--surface-3);
  color: var(--text-3);
  cursor: pointer;
}

.livre {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 11px 12px;
  border: 1px solid color-mix(in srgb, var(--success) 28%, var(--border));
  border-radius: 11px;
  background: color-mix(in srgb, var(--success) 6%, var(--surface-2));
  color: var(--success);
  font-family: inherit;
  font-size: 0.8125rem;
  font-weight: 650;
  text-align: left;
  white-space: nowrap;
  cursor: pointer;
}

.livre--on {
  background: color-mix(in srgb, var(--success) 14%, var(--surface));
  border-color: var(--success);
}

.livre span:first-of-type {
  flex: 1;
}

.livre-num {
  font-variant-numeric: tabular-nums;
  opacity: 0.75;
}

.menu {
  display: flex;
  flex-direction: column;
  margin-top: 8px;
}

.menu-item {
  display: flex;
  align-items: center;
  gap: 9px;
  min-height: 34px;
  padding: 7px 10px;
  border: none;
  border-radius: 9px;
  background: transparent;
  color: var(--text-3);
  font-family: inherit;
  font-size: 0.875rem;
  text-align: left;
  cursor: pointer;
}

.menu-item:hover {
  background: var(--surface-2);
  color: var(--text);
}

.menu-item--on {
  background: var(--calor-tinta);
  color: var(--calor-texto);
  font-weight: 650;
}

.menu-nome {
  flex: 1;
}

.menu-num {
  color: var(--text-4);
  font-size: 0.75rem;
  font-variant-numeric: tabular-nums;
}

.menu-item--on .menu-num {
  color: inherit;
  opacity: 0.7;
}

.limpar {
  align-self: flex-start;
  margin-top: 4px;
  padding: 6px 10px;
  border: none;
  background: transparent;
  color: var(--text-3);
  font-family: inherit;
  font-size: 0.8125rem;
  text-decoration: underline;
  cursor: pointer;
}

/* ─── Painel de categoria ───────────────────────────────────────────────── */
.lista {
  display: flex;
  flex-direction: column;
  gap: 20px;
  min-width: 0;
}

/*
 * O painel é o que dá limite entre um assunto e o seguinte.
 *
 * Só a borda de 1px não bastava: no tema claro é card branco sobre fundo
 * branco, e o limite sumia. A sombra `raised` é a mesma do board de tarefas,
 * e no tema escuro ela já vira um fio, então o card não fica chapado lá.
 */
.painel {
  border: 1px solid var(--border);
  border-radius: 16px;
  background: var(--surface);
  box-shadow: var(--shadow-raised);
  overflow: hidden;
}

.painel-topo {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 15px 18px;
  border-bottom: 1px solid color-mix(in srgb, var(--border) 65%, transparent);
  background: color-mix(in srgb, var(--brand-accent) 4%, var(--surface));
}

.painel-icone {
  flex: none;
  display: grid;
  place-items: center;
  width: 36px;
  height: 36px;
  border-radius: 11px;
  background: color-mix(in srgb, var(--brand-accent) 13%, var(--surface));
  color: var(--calor-texto);
}

.painel-texto {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.painel-texto h2 {
  margin: 0;
  color: var(--text);
  font-size: 1rem;
  font-weight: 700;
  letter-spacing: -0.01em;
}

.painel-desc {
  color: var(--text-3);
  font-size: 0.8125rem;
  line-height: 1.4;
}

.painel-num {
  flex: none;
  padding: 3px 9px;
  border-radius: 999px;
  background: var(--surface-2);
  color: var(--text-4);
  font-size: 0.75rem;
  font-weight: 650;
  font-variant-numeric: tabular-nums;
}

.itens {
  list-style: none;
  margin: 0;
  padding: 6px;
}

.item + .item {
  border-top: 1px solid color-mix(in srgb, var(--border) 45%, transparent);
}

.item--aberto {
  border-radius: 12px;
  background: var(--surface-2);
}

.item--aberto + .item,
.item--aberto {
  border-top-color: transparent;
}

/* A linha inteira é o alvo: catálogo é para varrer com o olho e clicar. */
.linha {
  display: flex;
  align-items: center;
  gap: 13px;
  width: 100%;
  min-height: 52px;
  padding: 10px 12px;
  border: none;
  border-radius: 11px;
  background: transparent;
  font-family: inherit;
  text-align: left;
  cursor: pointer;
  transition: background var(--motion-fast) var(--motion-ease);
}

.linha:hover {
  background: var(--calor-tinta);
}

.item--aberto .linha:hover {
  background: transparent;
}

.marca {
  flex: none;
  width: 32px;
  height: 32px;
  padding: 3px;
  border: 1px solid color-mix(in srgb, var(--border) 60%, transparent);
  border-radius: 9px;
  object-fit: contain;
  background: var(--surface);
}

.marca--letra {
  display: grid;
  place-items: center;
  padding: 0;
  color: var(--text-2);
  font-size: 0.875rem;
  font-weight: 700;
}

.linha-texto {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.linha-nome {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--text);
  font-size: 0.9375rem;
  font-weight: 650;
}

/* Recomendação em tinta quente e letra minúscula: convida, não grita. */
.essencial {
  padding: 2px 8px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--brand-accent) 14%, var(--surface));
  color: var(--calor-texto);
  font-size: 0.6875rem;
  font-weight: 650;
  white-space: nowrap;
}

.linha-para {
  color: var(--text-3);
  font-size: 0.8125rem;
  line-height: 1.5;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.item--aberto .linha-para {
  white-space: normal;
}

.linha-fim {
  flex: none;
  display: flex;
  align-items: center;
  gap: 14px;
}

/* Cor só onde há risco: "uso livre" é o esperado e fica discreto. */
.licenca {
  font-size: 0.75rem;
  font-weight: 650;
}

.licenca--ok,
.licenca--neutro {
  color: var(--text-4);
}

.licenca--aviso {
  color: var(--warn);
}

.preco {
  min-width: 126px;
  color: var(--text-4);
  font-size: 0.75rem;
  text-align: right;
}

/* ─── Detalhe ───────────────────────────────────────────────────────────── */
.detalhe {
  display: flex;
  flex-direction: column;
  gap: 11px;
  padding: 2px 16px 16px 57px;
}

.detalhe-licenca {
  margin: 0;
  color: var(--text-2);
  font-size: 0.8125rem;
  line-height: 1.55;
}

.detalhe-notas {
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.detalhe-notas p {
  margin: 0;
  color: var(--text-3);
  font-size: 0.8125rem;
  line-height: 1.55;
}

.detalhe-notas b {
  display: inline-block;
  min-width: 108px;
  color: var(--text-4);
  font-weight: 650;
}

.detalhe-aviso {
  margin: 0;
  padding: 9px 12px;
  border-radius: 9px;
  background: color-mix(in srgb, var(--warn) 10%, var(--surface));
  color: var(--warn);
  font-size: 0.8125rem;
  line-height: 1.5;
}

.ir {
  align-self: flex-start;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 38px;
  padding: 0 15px;
  border: 1px solid var(--border-strong);
  border-radius: 10px;
  background: var(--surface);
  color: var(--text);
  font-family: inherit;
  font-size: 0.8125rem;
  font-weight: 650;
  cursor: pointer;
}

.ir:hover {
  border-color: var(--calor-fio);
  color: var(--calor-texto);
}

.vazio {
  margin: 0;
  padding: 40px;
  border: 1px dashed var(--border);
  border-radius: 16px;
  color: var(--text-3);
  font-size: 0.875rem;
  text-align: center;
}

/* ─── Mudou neste ano ───────────────────────────────────────────────────── */
.mudou {
  list-style: none;
  margin: 0;
  padding: 14px 18px 18px;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  gap: 16px 24px;
}

.mudou li {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.mudou b {
  color: var(--text);
  font-size: 0.875rem;
  font-weight: 650;
}

.mudou span {
  color: var(--text-3);
  font-size: 0.8125rem;
  line-height: 1.55;
}

.mudou-troca {
  color: var(--calor-texto) !important;
  font-weight: 550;
}

/* ─── Antes de publicar ─────────────────────────────────────────────────── */
.check {
  list-style: none;
  margin: 0;
  padding: 16px 18px 20px;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
  gap: 16px 24px;
}

.check li {
  display: flex;
  gap: 11px;
  align-items: flex-start;
}

.check-num {
  flex: none;
  display: grid;
  place-items: center;
  width: 22px;
  height: 22px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--brand-accent) 13%, var(--surface));
  color: var(--calor-texto);
  font-size: 0.75rem;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.check li b {
  display: block;
  color: var(--text-2);
  font-size: 0.8125rem;
  font-weight: 650;
}

.check li b + span {
  display: block;
  margin-top: 3px;
  color: var(--text-4);
  font-size: 0.75rem;
  line-height: 1.55;
}

@media (max-width: 900px) {
  .corpo {
    grid-template-columns: minmax(0, 1fr);
  }

  .lado {
    position: static;
  }

  .menu-item {
    flex: 1 1 140px;
  }

  .menu {
    flex-direction: row;
    flex-wrap: wrap;
  }

  .topo {
    flex-direction: column;
  }

  .linha-fim {
    display: none;
  }
}

@media (prefers-reduced-motion: reduce) {
  .linha,
  .atalho {
    transition: none;
  }

  .atalho:hover {
    transform: none;
  }
}
</style>
