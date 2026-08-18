'use strict';

// 后端 api/ 子模块已 vendoring 进本仓库（src/lib/kugou-api/vendor/），
// 这样 EAS 云端打包时不再依赖未随 tarball 上传的 git 子模块内容。
const { createRequest } = require('./vendor/util/request.js');
const { calculateMid, generateWebGLHash, getGuid } = require('./vendor/util/util.js');
// qrcode 现已作为主工程依赖安装（见 package.json），其入口的图片渲染依赖 canvas/pngjs（RN 里不可用），
// 这里直接引用纯 JS 的编码核心生成点阵，由 UI 层（QrCodeView）自行渲染。
const { create: createQrSymbol } = require('qrcode/lib/core/qrcode.js');

function createQrMatrix(text) {
  const { modules } = createQrSymbol(text, { errorCorrectionLevel: 'M' });
  return { size: modules.size, data: modules.data };
}

module.exports = {
  createRequest,
  calculateMid,
  generateWebGLHash,
  getGuid,
  createQrMatrix,
};
