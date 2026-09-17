const samples = {
  poem: '春|風|が|吹く|春|花|が|咲く|風|が|吹く|空|が|青い|花|が|咲く|春|空|が|青い',
  cafe: '朝|カフェ|に|入る|コーヒー|を|注文する|窓|の|そば|に|座る|朝|コーヒー|を|飲む|本|を|開く|静かな|朝',
  story: '小さな|町|に|古い|時計塔|が|あった|時計塔|の|下|に|猫|が|いた|ある日|町|に|旅人|が|来た|旅人|は|猫|と|出会った'
};

const dataInput = document.querySelector('#training-data');
const lengthInput = document.querySelector('#length');
const lengthValue = document.querySelector('#length-value');
const output = document.querySelector('#output-text');
const trace = document.querySelector('#trace');
const graph = document.querySelector('#graph');
const emptyGraph = document.querySelector('#empty-graph');
const modelStatus = document.querySelector('#model-status');
let model = { tokens: [], states: [], transitions: new Map(), counts: new Map(), starts: [] };
let lastPath = [];

function parseSequences() {
  return dataInput.value
    .split(/\r?\n/)
    .map(line => line.split('|').map(token => token.trim()).filter(Boolean))
    .filter(sequence => sequence.length);
}

function chooseStartToken() {
  const startTokens = model.starts.length ? model.starts : model.states;
  return startTokens[Math.floor(Math.random() * startTokens.length)];
}

function buildModel() {
  const sequences = parseSequences();
  const tokens = sequences.flat();
  lastPath = [];
  trace.replaceChildren();
  output.textContent = tokens.length ? '生成するボタンを押すと、ここに文章が現れます。' : '教師データを入力してください。';
  const transitions = new Map();
  const counts = new Map();
  const starts = sequences.map(sequence => sequence[0]).filter(Boolean);
  tokens.forEach(token => counts.set(token, (counts.get(token) || 0) + 1));
  sequences.forEach(sequence => {
    for (let index = 0; index < sequence.length - 1; index += 1) {
      const from = sequence[index];
      const to = sequence[index + 1];
      if (!transitions.has(from)) transitions.set(from, new Map());
      const next = transitions.get(from);
      next.set(to, (next.get(to) || 0) + 1);
    }
  });
  model = { tokens, states: [...counts.keys()], transitions, counts, starts };
  updateStats();
  drawGraph();
  if (!tokens.length) {
    modelStatus.textContent = 'EMPTY';
  } else {
    modelStatus.textContent = 'READY';
  }
}

function updateStats() {
  document.querySelector('#token-count').textContent = model.tokens.length;
  document.querySelector('#state-count').textContent = model.states.length;
  let links = 0;
  model.transitions.forEach(next => next.forEach(() => { links += 1; }));
  document.querySelector('#transition-count').textContent = links;
}

function chooseNext(from) {
  const options = model.transitions.get(from);
  if (!options || !options.size) return null;
  const total = [...options.values()].reduce((sum, value) => sum + value, 0);
  let cursor = Math.random() * total;
  for (const [token, weight] of options) {
    cursor -= weight;
    if (cursor < 0) return token;
  }
  return [...options.keys()][0];
}

function generate() {
  buildModel();
  if (!model.states.length) return;
  const requestedLength = Number(lengthInput.value);
  const path = [chooseStartToken()];
  const lineBreaks = new Set();
  while (path.length < requestedLength) {
    const next = chooseNext(path[path.length - 1]);
    if (!next) {
      lineBreaks.add(path.length - 1);
      path.push(chooseStartToken());
    } else {
      path.push(next);
    }
  }
  lastPath = path;
  output.textContent = path.map((token, index) => `${token}${lineBreaks.has(index) ? '\n' : ''}`).join('');
  modelStatus.textContent = 'GENERATED';
  trace.replaceChildren(...path.map((token, index) => {
    const fragment = document.createDocumentFragment();
    const item = document.createElement('span');
    item.className = 'trace-token';
    item.textContent = token;
    fragment.append(item);
    if (index < path.length - 1) {
      if (lineBreaks.has(index)) {
        fragment.append(document.createElement('br'));
      } else {
        const arrow = document.createElement('span');
        arrow.className = 'trace-arrow';
        arrow.textContent = '→';
        fragment.append(arrow);
      }
    }
    return fragment;
  }));
  drawGraph();
}

function svgElement(name, attrs) {
  const element = document.createElementNS('http://www.w3.org/2000/svg', name);
  Object.entries(attrs).forEach(([key, value]) => element.setAttribute(key, value));
  return element;
}

function drawGraph() {
  graph.replaceChildren();
  if (!model.states.length) { emptyGraph.hidden = false; return; }
  emptyGraph.hidden = true;
  const baseWidth = graph.parentElement.clientWidth || 700;
  const columns = Math.max(1, Math.ceil(Math.sqrt(model.states.length)));
  const rows = Math.ceil(model.states.length / columns);
  const width = Math.max(baseWidth, columns * 175 + 40);
  const height = Math.max(385, rows * 82 + 55);
  graph.setAttribute('viewBox', `0 0 ${width} ${height}`);
  graph.style.width = `${width}px`;
  graph.style.height = `${height}px`;
  const defs = svgElement('defs', {});
  const marker = svgElement('marker', { id: 'arrow', markerWidth: 7, markerHeight: 7, refX: 6, refY: 3.5, orient: 'auto' });
  marker.append(svgElement('path', { d: 'M0,0 L7,3.5 L0,7 Z', fill: '#82929a' }));
  defs.append(marker); graph.append(defs);
  const positions = new Map();
  model.states.forEach((state, index) => {
    positions.set(state, { x: 82 + (index % columns) * 175, y: 42 + Math.floor(index / columns) * 82 });
  });
  const activeEdges = new Set(lastPath.slice(0, -1).map((token, i) => `${token}→${lastPath[i + 1]}`));
  model.transitions.forEach((next, from) => next.forEach((weight, to) => {
    const start = positions.get(from); const end = positions.get(to); const same = from === to;
    const bend = same ? 32 : Math.min(42, Math.max(18, Math.abs(end.y - start.y) * .12));
    const d = same ? `M ${start.x} ${start.y - 15} C ${start.x - bend} ${start.y - 55}, ${start.x + bend} ${start.y - 55}, ${start.x} ${start.y - 15}` : `M ${start.x} ${start.y} Q ${(start.x + end.x) / 2} ${(start.y + end.y) / 2 - bend} ${end.x} ${end.y}`;
    const edge = svgElement('path', { d, class: `edge${activeEdges.has(`${from}→${to}`) ? ' active' : ''}`, 'stroke-width': 1 + weight * 1.2, 'marker-end': 'url(#arrow)' });
    graph.append(edge);
    if (!same) {
      const label = svgElement('text', { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 - bend / 2, class: 'edge-label' });
      label.textContent = weight; graph.append(label);
    }
  }));
  model.states.forEach(state => {
    const position = positions.get(state); const count = model.counts.get(state); const size = 13 + Math.min(count, 7) * 1.8;
    const node = svgElement('g', { class: `node${model.starts.includes(state) ? ' start' : ''}${lastPath.includes(state) ? ' active' : ''}` });
    node.append(svgElement('circle', { cx: position.x, cy: position.y, r: size }));
    const label = svgElement('text', { x: position.x, y: position.y }); label.textContent = state; node.append(label); graph.append(node);
  });
  document.querySelector('#graph-count').textContent = `${model.states.length} states / ${[...activeEdges].length} generated links`;
}

dataInput.addEventListener('input', buildModel);
lengthInput.addEventListener('input', () => { lengthValue.textContent = lengthInput.value; });
document.querySelector('#generate').addEventListener('click', generate);
document.querySelectorAll('[data-sample]').forEach(button => button.addEventListener('click', () => {
  dataInput.value = samples[button.dataset.sample];
  buildModel();
}));
window.addEventListener('resize', drawGraph);
buildModel();