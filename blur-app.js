document.addEventListener('DOMContentLoaded', () => {
  const fileInput = document.getElementById('file-input');
  const uploadBtn = document.getElementById('upload-btn');
  const clearBtn = document.getElementById('clear-btn');
  const mainCanvas = document.getElementById('main-canvas');
  const statusElement = document.getElementById('status');
  const loader = document.getElementById('loader');
  const blurStrength = document.getElementById('blur-strength');
  const blurValue = document.getElementById('blur-value');

  let originalImage = null;
  let isProcessed = false;
  let detectedFaces = [];

  // 設定値が変更されたらリアルタイムで反映
  blurStrength.addEventListener('input', () => {
    blurValue.textContent = blurStrength.value;
    if (isProcessed && originalImage) {
      applyBlurToFaces();
    }
  });

  // FaceDetectorが利用可能かチェック
  if (!('FaceDetector' in window)) {
    statusElement.textContent = 'お使いのブラウザはFace Detection APIをサポートしていません。Chrome with experimental featuresで試してください。';
    uploadBtn.disabled = true;
  }

  // アップロードボタンのクリックハンドラ
  uploadBtn.addEventListener('click', () => {
    fileInput.click();
  });

  // クリアボタンのクリックハンドラ
  clearBtn.addEventListener('click', () => {
    if (originalImage) {
      drawImageToCanvas(originalImage, mainCanvas);
      isProcessed = false;
      clearBtn.disabled = true;
      statusElement.textContent = '元の画像に戻しました。';
    }
  });

  // ファイル選択時の処理
  fileInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    // 画像ファイルかチェック
    if (!file.type.match('image.*')) {
      statusElement.textContent = '画像ファイルを選択してください';
      return;
    }

    try {
      loader.style.display = 'block';
      statusElement.textContent = '画像を読み込み中...';
      
      originalImage = await createImageFromFile(file);
      
      // 元の画像を表示
      drawImageToCanvas(originalImage, mainCanvas);
      
      // 顔検出
      statusElement.textContent = '顔を検出中...';
      detectedFaces = await detectFaces(originalImage);
      
      if (detectedFaces.length === 0) {
        statusElement.textContent = '顔が検出されませんでした。';
      } else {
        statusElement.textContent = `${detectedFaces.length}つの顔を検出しました。ぼかし処理を適用します。`;
        // 顔ぼかし処理を適用
        await applyBlurToFaces();
      }
      
    } catch (error) {
      statusElement.textContent = `エラーが発生しました: ${error.message}`;
      console.error(error);
    } finally {
      loader.style.display = 'none';
    }
  });

  // 顔検出処理
  async function detectFaces(img) {
    const faceDetector = new FaceDetector({
      fastMode: false,
      maxDetectedFaces: 10
    });
    
    try {
      return await faceDetector.detect(img);
    } catch (error) {
      throw new Error(`顔検出中にエラーが発生しました: ${error.message}`);
    }
  }

  // 顔ぼかし処理を適用
  async function applyBlurToFaces() {
    // 元の画像からやり直す
    drawImageToCanvas(originalImage, mainCanvas);
    
    const ctx = mainCanvas.getContext('2d');
    const strength = parseInt(blurStrength.value);
    
    // 検出された顔をぼかす
    for (const face of detectedFaces) {
      const { x, y, width, height } = face.boundingBox;
      
      // シンプルなぼかし効果を適用
      simpleBoxBlur(ctx, x, y, width, height, strength);
    }
    
    isProcessed = true;
    clearBtn.disabled = false;
    statusElement.textContent = 'ぼかし処理を適用しました。「元の画像に戻す」で元に戻せます。';
  }

  // ファイルからImageオブジェクトを作成
  function createImageFromFile(file) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = URL.createObjectURL(file);
    });
  }

  // キャンバスに画像を描画
  function drawImageToCanvas(img, canvas) {
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0);
    return ctx;
  }

  // シンプルなボックスぼかし（より確実に動作する改良版）
  function simpleBoxBlur(ctx, x, y, width, height, radius) {
    // 境界チェック
    x = Math.max(0, Math.floor(x));
    y = Math.max(0, Math.floor(y));
    width = Math.min(ctx.canvas.width - x, Math.floor(width));
    height = Math.min(ctx.canvas.height - y, Math.floor(height));
    
    if (width <= 0 || height <= 0) return;
    
    // 顔領域の画像データを取得
    const imgData = ctx.getImageData(x, y, width, height);
    const pixels = imgData.data;
    
    // 一時データ配列を作成
    const tempPixels = new Uint8ClampedArray(pixels.length);
    
    // ぼかし処理の繰り返し回数
    const iterations = Math.min(5, Math.max(1, Math.ceil(radius / 5)));
    
    for (let iter = 0; iter < iterations; iter++) {
      // 現在の画像データをコピー
      tempPixels.set(pixels);
      
      // 水平方向のぼかし
      for (let i = 0; i < height; i++) {
        for (let j = radius; j < width - radius; j++) {
          let r = 0, g = 0, b = 0, a = 0;
          let count = 0;
          
          // カーネル内のピクセルを平均化
          for (let k = j - radius; k <= j + radius; k++) {
            if (k >= 0 && k < width) {
              const idx = (i * width + k) * 4;
              r += tempPixels[idx];
              g += tempPixels[idx + 1];
              b += tempPixels[idx + 2];
              a += tempPixels[idx + 3];
              count++;
            }
          }
          
          // 出力ピクセルに平均値を設定
          const idx = (i * width + j) * 4;
          pixels[idx] = Math.round(r / count);
          pixels[idx + 1] = Math.round(g / count);
          pixels[idx + 2] = Math.round(b / count);
          pixels[idx + 3] = Math.round(a / count);
        }
      }
      
      // 一時データ配列を更新
      tempPixels.set(pixels);
      
      // 垂直方向のぼかし
      for (let i = radius; i < height - radius; i++) {
        for (let j = 0; j < width; j++) {
          let r = 0, g = 0, b = 0, a = 0;
          let count = 0;
          
          // カーネル内のピクセルを平均化
          for (let k = i - radius; k <= i + radius; k++) {
            if (k >= 0 && k < height) {
              const idx = (k * width + j) * 4;
              r += tempPixels[idx];
              g += tempPixels[idx + 1];
              b += tempPixels[idx + 2];
              a += tempPixels[idx + 3];
              count++;
            }
          }
          
          // 出力ピクセルに平均値を設定
          const idx = (i * width + j) * 4;
          pixels[idx] = Math.round(r / count);
          pixels[idx + 1] = Math.round(g / count);
          pixels[idx + 2] = Math.round(b / count);
          pixels[idx + 3] = Math.round(a / count);
        }
      }
    }
    
    // 処理した画像データをキャンバスに戻す
    ctx.putImageData(imgData, x, y);
  }
});
