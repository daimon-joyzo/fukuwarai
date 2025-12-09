(function () {
  'use strict';

  const VIEW_NAME = 'RankingView';
  const REFRESH_INTERVAL = 10000;

  const fetchRecords = async () => {
    const query = 'order by score_total desc limit 100';
    const body = { app: kintone.app.getId(), query }; 
    const resp = await kintone.api(kintone.api.url('/k/v1/records', true), 'GET', body);
    return resp.records || [];
  };

  const createCard = (record, index) => {
    const card = document.createElement('div');
    card.className = 'rank-card';

    const left = document.createElement('div');
    left.className = 'rank-left';
    const position = document.createElement('div');
    position.className = 'rank-position';
    position.textContent = `${index + 1}位`;

    const team = document.createElement('div');
    team.className = 'rank-team';
    team.textContent = record.team_lookup.value || 'チーム未設定';

    const score = document.createElement('div');
    score.className = 'rank-score';
    score.textContent = `${record.score_total.value || 0} 点`;

    left.appendChild(position);
    left.appendChild(team);
    left.appendChild(score);

    const right = document.createElement('div');
    right.className = 'rank-right';
    const img = document.createElement('img');
    img.alt = '完成画像';

    const resultFile = (record.result_image.value || [])[0];
    if (resultFile) {
      img.src = `/k/v1/file.json?fileKey=${encodeURIComponent(resultFile.fileKey)}`;
    } else {
      img.classList.add('placeholder');
      img.src = '';
    }

    right.appendChild(img);

    card.appendChild(left);
    card.appendChild(right);
    return card;
  };

  const renderRanking = (records, container) => {
    container.innerHTML = '';
    records.forEach((rec, idx) => {
      const card = createCard(rec, idx);
      container.appendChild(card);
    });
  };

  const buildLayout = () => {
    const root = document.createElement('div');
    root.className = 'ranking-container';
    const header = document.createElement('h1');
    header.textContent = 'リアルタイムランキング';
    const grid = document.createElement('div');
    grid.className = 'ranking-grid';
    root.appendChild(header);
    root.appendChild(grid);
    return { root, grid };
  };

  const setupRanking = async (event) => {
    if (event.viewName !== VIEW_NAME) return event;

    const space = kintone.app.getHeaderSpaceElement();
    space.innerHTML = '';

    const { root, grid } = buildLayout();
    space.appendChild(root);

    const refresh = async () => {
      const records = await fetchRecords();
      renderRanking(records, grid);
    };

    await refresh();
    const timer = setInterval(refresh, REFRESH_INTERVAL);

    event.onRecordIndexEdit = () => clearInterval(timer);
    return event;
  };

  kintone.events.on('app.record.index.show', setupRanking);
})();
