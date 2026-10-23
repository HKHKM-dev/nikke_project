// Apps Script の受け口（plan/design-cloud-environment.md 5 節）。オーナーとして動き、決めた 3 つのフォルダの中だけを読み書きする。
// 公開: デプロイ → ウェブアプリ（実行するユーザー: 自分、アクセスできるユーザー: 全員）。手順は plan/cloud-guide.md「準備」。
// スクリプトのプロパティ: KEY（合言葉）、ROOT_SYNC（nikke_sync）・ROOT_CAPTURES（nikke_project_captures）・
//   ROOT_RECORD（マイ コンピュータ/record）のフォルダ ID。
// 要求は POST の JSON（{ key, op, ... }）。合言葉はクエリ文字列の key でもよい（ネットワークシークレットの Body parameter 型）。
// 書けるのは nikke_sync の下と nikke_project_captures/frames/ の下だけ。消すのはごみ箱への移動だけ（完全には消さない）。

var MAX_BYTES = 10 * 1024 * 1024;

function doPost(e) {
  try {
    var req = JSON.parse(e.postData.contents);
    var props = PropertiesService.getScriptProperties();
    var key = (e.parameter && e.parameter.key) || req.key;
    if (!key || key !== props.getProperty('KEY')) return reply({ ok: false, error: '合言葉が違う' });
    var roots = {
      sync: props.getProperty('ROOT_SYNC'),
      captures: props.getProperty('ROOT_CAPTURES'),
      record: props.getProperty('ROOT_RECORD'),
    };
    var op = OPS[req.op];
    if (!op) return reply({ ok: false, error: '知らない操作: ' + req.op });
    return reply(op(req, roots));
  } catch (err) {
    return reply({ ok: false, error: String(err && err.message ? err.message : err) });
  }
}

function reply(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

/** 根からの相対パスを分ける（.. と空は断る） */
function parts(path) {
  var p = String(path || '')
    .split('/')
    .filter(function (s) {
      return s !== '';
    });
  p.forEach(function (s) {
    if (s === '.' || s === '..') throw new Error('パスに . や .. は使えない: ' + path);
  });
  return p;
}

function root(roots, name) {
  var id = roots[name];
  if (!id) throw new Error('根が無い: ' + name);
  return DriveApp.getFolderById(id);
}

function childFolder(folder, name, create) {
  var it = folder.getFoldersByName(name);
  while (it.hasNext()) {
    var f = it.next();
    if (!f.isTrashed()) return f;
  }
  return create ? folder.createFolder(name) : null;
}

function folderAt(base, dirs, create) {
  var f = base;
  for (var i = 0; i < dirs.length && f; i++) f = childFolder(f, dirs[i], create);
  return f;
}

function fileIn(folder, name) {
  if (!folder) return null;
  var it = folder.getFilesByName(name);
  while (it.hasNext()) {
    var f = it.next();
    if (!f.isTrashed()) return f;
  }
  return null;
}

function locate(roots, rootName, path, create) {
  var p = parts(path);
  if (p.length === 0) throw new Error('パスが空');
  var folder = folderAt(root(roots, rootName), p.slice(0, -1), create);
  return { folder: folder, name: p[p.length - 1], file: fileIn(folder, p[p.length - 1]) };
}

function md5(bytes) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, bytes)
    .map(function (b) {
      return ('0' + ((b + 256) % 256).toString(16)).slice(-2);
    })
    .join('');
}

/** owner.md → owner.conflict-cloud.md（あれば番号を足す） */
function conflictName(folder, name) {
  var i = name.lastIndexOf('.');
  var stem = i > 0 ? name.slice(0, i) : name;
  var ext = i > 0 ? name.slice(i) : '';
  for (var n = 0; ; n++) {
    var candidate = stem + '.conflict-cloud' + (n === 0 ? '' : String(n)) + ext;
    if (!fileIn(folder, candidate)) return candidate;
  }
}

function writable(rootName, path) {
  return rootName === 'sync' || (rootName === 'captures' && parts(path)[0] === 'frames');
}

var OPS = {
  /** 根の下の prefix の一覧（相対パス・大きさ・md5・更新時刻）。maxBytes 以下のものは中身（base64）も返す */
  snapshot: function (req, roots) {
    var base = folderAt(root(roots, req.root), parts(req.prefix), false);
    var files = [];
    var max = req.maxBytes || 0;
    function walk(folder, rel) {
      var it = folder.getFiles();
      while (it.hasNext()) {
        var f = it.next();
        var path = rel + f.getName();
        var item = { path: path, size: f.getSize(), modified: f.getLastUpdated().toISOString() };
        if (f.getSize() <= max) {
          var bytes = f.getBlob().getBytes();
          item.md5 = md5(bytes);
          item.content = Utilities.base64Encode(bytes);
        }
        files.push(item);
      }
      var dirs = folder.getFolders();
      while (dirs.hasNext()) {
        var d = dirs.next();
        walk(d, rel + d.getName() + '/');
      }
    }
    var prefix = parts(req.prefix).join('/');
    if (base) walk(base, prefix === '' ? '' : prefix + '/');
    return { ok: true, files: files };
  },

  get: function (req, roots) {
    var at = locate(roots, req.root, req.path, false);
    if (!at.file) return { ok: true, missing: true };
    var bytes = at.file.getBlob().getBytes();
    return { ok: true, md5: md5(bytes), content: Utilities.base64Encode(bytes) };
  },

  /** 作るか上書きする。Drive の今の md5 が呼ぶ側の baseMd5 と違えば、上書きせず別名（.conflict-cloud）で置く */
  put: function (req, roots) {
    if (!writable(req.root, req.path)) throw new Error('ここには書けない: ' + req.root + '/' + req.path);
    var bytes = Utilities.base64Decode(req.content);
    if (bytes.length > MAX_BYTES) throw new Error('大きすぎる（' + bytes.length + ' バイト）');
    var at = locate(roots, req.root, req.path, true);
    var sum = md5(bytes);
    var blob = Utilities.newBlob(bytes, 'application/octet-stream', at.name);
    if (at.file) {
      var current = md5(at.file.getBlob().getBytes());
      if (current === sum) return { ok: true, md5: sum, path: req.path, unchanged: true };
      if (current !== req.baseMd5) {
        var other = conflictName(at.folder, at.name);
        at.folder.createFile(blob.setName(other));
        var p = parts(req.path);
        p[p.length - 1] = other;
        return { ok: true, md5: sum, path: p.join('/'), conflict: true };
      }
      // DriveApp は中身を差し替えられないので、新しく作って古い方をごみ箱へ移す
      at.folder.createFile(blob);
      at.file.setTrashed(true);
      return { ok: true, md5: sum, path: req.path };
    }
    at.folder.createFile(blob);
    return { ok: true, md5: sum, path: req.path };
  },

  /** ごみ箱へ移す。Drive の今の md5 が baseMd5 と違えば（ほかで変わった）消さない */
  trash: function (req, roots) {
    if (!writable(req.root, req.path)) throw new Error('ここは消せない: ' + req.root + '/' + req.path);
    var at = locate(roots, req.root, req.path, false);
    if (!at.file) return { ok: true, missing: true };
    if (md5(at.file.getBlob().getBytes()) !== req.baseMd5) return { ok: true, skipped: 'changed' };
    at.file.setTrashed(true);
    return { ok: true };
  },

  /** 移動と改名（取り込み・録画の番号の振り直し）。移せなければ、Drive の中でコピーして元をごみ箱へ移す */
  move: function (req, roots) {
    if (['captures', 'record'].indexOf(req.root) < 0 || req.toRoot !== 'captures')
      throw new Error('移せるのは record か nikke_project_captures から nikke_project_captures へだけ');
    var from = locate(roots, req.root, req.from, false);
    if (!from.file) throw new Error('無い: ' + req.root + '/' + req.from);
    var to = locate(roots, req.toRoot, req.to, true);
    if (to.file) throw new Error('もうある: ' + req.toRoot + '/' + req.to);
    try {
      from.file.moveTo(to.folder);
      from.file.setName(to.name);
      return { ok: true, how: 'move' };
    } catch (err) {
      from.file.makeCopy(to.name, to.folder);
      from.file.setTrashed(true);
      return { ok: true, how: 'copy', note: String(err) };
    }
  },
};
