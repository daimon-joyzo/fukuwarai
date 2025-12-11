(function () {
  'use strict';

  const STATUS_PLAYING = 'プレイ中';
  const BASE_SCORE = 100;
  const BASE_MOVE = 5;
  const SHIFT_MULTIPLIER = 4;
  const REFRESH_DELAY_MS = 300;

  const fetchFileBlob = (fileKey) =>
    kintone.api(kintone.api.url('/k/v1/file', true), 'GET', { fileKey }, { responseType: 'arraybuffer' }).then((resp) =>
      new Blob([resp], { type: 'application/octet-stream' })
    );

  const createObjectUrl = (blob) => URL.createObjectURL(blob);

  const downloadImages = async (attachments = []) => {
    const results = [];
    for (const file of attachments) {
      const blob = await fetchFileBlob(file.fileKey);
      results.push({ name: file.name, url: createObjectUrl(blob) });
    }
    return results;
  };

  const downloadAudio = async (attachment) => {
    if (!attachment) return null;
    const blob = await fetchFileBlob(attachment.fileKey);
    return createObjectUrl(blob);
  };

  const parseJsonField = (value) => {
    if (!value) return [];
    try {
      return JSON.parse(value);
    } catch (e) {
      console.warn('JSON parse failed', e);
      return [];
    }
  };

  const randomPosition = (width, height) => ({
    x: Math.random() * width * 0.8 + width * 0.1,
    y: Math.random() * height * 0.8 + height * 0.1,
  });

  const buildKonvaStage = (container, width, height) => {
    const stage = new Konva.Stage({ container, width, height });
    const backgroundLayer = new Konva.Layer();
    const partsLayer = new Konva.Layer();
    stage.add(backgroundLayer);
    stage.add(partsLayer);
    return { stage, backgroundLayer, partsLayer };
  };

  const loadImageNode = (url, options) =>
    new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () =>
        resolve(new Konva.Image({ image: img, ...options }));
      img.onerror = reject;
      img.src = url;
    });

  const attachBackground = async (layer, url, width, height) => {
    const node = await loadImageNode(url, { x: 0, y: 0, width, height, listening: false });
    layer.add(node);
    layer.draw();
  };

  const attachParts = async (layer, partImages, width, height) => {
    const nodes = [];
    for (const part of partImages) {
      const pos = randomPosition(width, height);
      const node = await loadImageNode(part.url, {
        x: pos.x,
        y: pos.y,
        draggable: true,
        name: part.name,
        shadowBlur: 8,
        shadowOpacity: 0.3,
      });
      layer.add(node);
      nodes.push(node);
    }
    layer.draw();
    return nodes;
  };

  const bindSelection = (stage, nodes) => {
    let active = null;
    nodes.forEach((node) => {
      node.on('click tap', () => {
        active = node;
        nodes.forEach((n) => n.strokeWidth(0));
        node.stroke('orange');
        node.strokeWidth(3);
        node.draw();
      });
    });

    const moveActive = (dx, dy) => {
      if (!active) return;
      active.x(active.x() + dx);
      active.y(active.y() + dy);
      active.getLayer().batchDraw();
    };

    const keyHandler = (ev) => {
      if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(ev.key)) return;
      ev.preventDefault();
      const step = ev.shiftKey ? BASE_MOVE * SHIFT_MULTIPLIER : BASE_MOVE;
      const dx = ev.key === 'ArrowLeft' ? -step : ev.key === 'ArrowRight' ? step : 0;
      const dy = ev.key === 'ArrowUp' ? -step : ev.key === 'ArrowDown' ? step : 0;
      moveActive(dx, dy);
    };

    stage.container().tabIndex = 0;
    stage.container().focus();
    document.addEventListener('keydown', keyHandler);

    return () => document.removeEventListener('keydown', keyHandler);
  };

  const serializePositions = (nodes) =>
    nodes.map((node) => ({ name: node.name(), x: node.x(), y: node.y() }));

  const calculateScore = (placements, targetCoordinates, difficultyWeight) => {
    const weight = Number(difficultyWeight) || 1;
    let totalDistance = 0;
    placements.forEach((placement) => {
      const target = targetCoordinates.find((t) => t.name === placement.name);
      if (!target) return;
      const dx = placement.x - target.x;
      const dy = placement.y - target.y;
      totalDistance += Math.sqrt(dx * dx + dy * dy) * weight;
    });
    const score = Math.max(BASE_SCORE - totalDistance, 0);
    return Math.round(score);
  };

  const uploadBlob = async (blob, filename) => {
    const formData = new FormData();
    formData.append('__REQUEST_TOKEN__', kintone.getRequestToken());
    formData.append('file', blob, filename);
    const url = kintone.api.url('/k/v1/file', true);
    const response = await fetch(url, { method: 'POST', body: formData });
    const json = await response.json();
    return json.fileKey;
  };

  const updateRecord = async (recordId, fields) => {
    const body = { app: kintone.app.getId(), id: recordId, record: fields };
    return kintone.api(kintone.api.url('/k/v1/record', true), 'PUT', body);
  };

  const saveCanvasImage = async (stage, record) => {
    const dataUrl = stage.toDataURL({ pixelRatio: 2 });
    const res = await fetch(dataUrl);
    const blob = await res.blob();
    const fileKey = await uploadBlob(blob, `result-${record.$id.value}.png`);
    return [{ fileKey }];
  };

  const setupBgm = (audioUrl, volumeSlider) => {
    if (!audioUrl || typeof Howl !== 'function') return null;
    const howl = new Howl({ src: [audioUrl], loop: true, volume: volumeSlider.valueAsNumber });
    howl.play();
    volumeSlider.addEventListener('input', () => howl.volume(volumeSlider.valueAsNumber));
    return howl;
  };

  const buildControls = () => {
    const container = document.createElement('div');
    container.className = 'game-controls';

    const completeBtn = new kintoneUIComponent.Button({ text: '配置完了', type: 'submit' });
    const volumeLabel = document.createElement('label');
    volumeLabel.textContent = '音量';
    volumeLabel.className = 'volume-label';
    const volumeSlider = document.createElement('input');
    volumeSlider.type = 'range';
    volumeSlider.min = '0';
    volumeSlider.max = '1';
    volumeSlider.step = '0.05';
    volumeSlider.value = '0.5';

    container.appendChild(volumeLabel);
    container.appendChild(volumeSlider);
    container.appendChild(completeBtn.render());

    return { container, completeBtn, volumeSlider };
  };

  const buildOverlayShell = () => {
    const overlay = document.createElement('div');
    overlay.className = 'game-overlay';

    const panel = document.createElement('div');
    panel.className = 'game-overlay__panel';

    const header = document.createElement('div');
    header.className = 'game-overlay__header';
    const title = document.createElement('div');
    title.className = 'game-overlay__title';
    title.textContent = '福笑いを全画面でプレイ中';
    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'game-overlay__close';
    closeBtn.textContent = '閉じる';
    header.appendChild(title);
    header.appendChild(closeBtn);

    const body = document.createElement('div');
    body.className = 'game-overlay__body';

    panel.appendChild(header);
    panel.appendChild(body);
    overlay.appendChild(panel);

    return { overlay, body, closeBtn };
  };

  const showCompletionAlert = async () => {
    if (typeof Swal !== 'function') return;
    await Swal.fire({
      title: 'お疲れさま！',
      text: 'スコアを計算しています…',
      icon: 'success',
      confirmButtonText: 'OK',
      timer: 1200,
      showConfirmButton: false,
    });
  };

  const handleDetailShow = async (event) => {
    const record = event.record;
    if (record.game_status.value !== STATUS_PLAYING) return event;

    const space = kintone.app.record.getSpaceElement('space_game_area');
    if (!space) return event;

    space.innerHTML = '';
    const launcher = document.createElement('div');
    launcher.className = 'game-launcher';
    launcher.textContent = '全画面モードで福笑いをプレイできます。';
    const openButton = new kintoneUIComponent.Button({ text: '全画面でプレイ' });
    launcher.appendChild(openButton.render());
    space.appendChild(launcher);

    const { overlay, body: overlayBody, closeBtn } = buildOverlayShell();
    const container = document.createElement('div');
    container.className = 'game-container game-container--fullscreen';
    const canvasWrapper = document.createElement('div');
    canvasWrapper.className = 'game-stage game-stage--fullscreen';
    container.appendChild(canvasWrapper);

    const { container: controls, completeBtn, volumeSlider } = buildControls();
    controls.classList.add('game-controls--fullscreen');
    container.appendChild(controls);
    overlayBody.appendChild(container);
    document.body.appendChild(overlay);

    const width = canvasWrapper.clientWidth || window.innerWidth;
    const height = canvasWrapper.clientHeight || window.innerHeight;

    const { stage, backgroundLayer, partsLayer } = buildKonvaStage(canvasWrapper, width, height);

    const [baseImage] = record.img_base.value || [];
    const partImagesRaw = record.img_parts.value || [];
    const bgmAttachment = (record.bgm_file.value || [])[0];
    const targetCoordinates = parseJsonField(record.target_coordinates.value);
    const difficultyWeight = record.difficulty_weight.value;

    const [baseUrl, parts] = await Promise.all([
      baseImage ? fetchFileBlob(baseImage.fileKey).then(createObjectUrl) : null,
      downloadImages(partImagesRaw),
    ]);

    if (baseUrl) await attachBackground(backgroundLayer, baseUrl, width, height);
    const nodes = await attachParts(partsLayer, parts, width, height);
    const unbindKeys = bindSelection(stage, nodes);

    const bgmUrl = await downloadAudio(bgmAttachment);
    const bgm = setupBgm(bgmUrl, volumeSlider);

    const lockScroll = (locked) =>
      document.body.classList[locked ? 'add' : 'remove']('game-scroll-lock');

    const hideOverlay = () => {
      overlay.classList.add('is-hidden');
      if (bgm && typeof bgm.pause === 'function') bgm.pause();
      lockScroll(false);
    };

    const showOverlay = () => {
      overlay.classList.remove('is-hidden');
      if (bgm && typeof bgm.play === 'function') bgm.play();
      lockScroll(true);
      stage.container().focus();
    };

    showOverlay();
    closeBtn.addEventListener('click', hideOverlay);
    openButton.on('click', showOverlay);

    completeBtn.on('click', async () => {
      if (bgm) bgm.stop();
      const placements = serializePositions(nodes);
      const scoreAuto = calculateScore(placements, targetCoordinates, difficultyWeight);
      const [resultImage] = await saveCanvasImage(stage, record);

      const playLogJson = JSON.stringify(placements, null, 2);
      await updateRecord(record.$id.value, {
        result_image: { value: [resultImage] },
        play_log_json: { value: playLogJson },
        score_auto: { value: scoreAuto },
      });

      await showCompletionAlert();
      unbindKeys();
      hideOverlay();
      setTimeout(() => location.reload(), REFRESH_DELAY_MS);
    });

    return event;
  };

  kintone.events.on('app.record.detail.show', handleDetailShow);
})();
