const form = document.querySelector("#converter-form");
const status = document.querySelector("#status");
const button = document.querySelector("#convert");

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const file = document.querySelector("#file").files[0];
  if (!file) return;

  const targetFormat = document.querySelector("#format").value;
  button.disabled = true;

  try {
    const isNcm = file.name.toLowerCase().endsWith(".ncm");

    if (isNcm) {
      status.textContent = `正在纯前端解密 NCM 文件 ${file.name}…`;
      const arrayBuffer = await file.arrayBuffer();
      const ncmResult = window.decryptNcm(arrayBuffer);

      const baseName = (ncmResult.artist ? `${ncmResult.artist} - ` : "") + (ncmResult.title || file.name.replace(/\.ncm$/i, ""));
      const decryptedFormat = ncmResult.format;

      if (targetFormat === decryptedFormat) {
        status.textContent = "解密完成，直接在浏览器中下载音频…";
        const mimeTypes = {
          mp3: "audio/mpeg",
          flac: "audio/flac",
          wav: "audio/wav",
          m4a: "audio/mp4",
          ogg: "audio/ogg",
        };
        const blob = new Blob([ncmResult.audioBuffer], { type: mimeTypes[decryptedFormat] || "application/octet-stream" });
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = `${baseName}.${decryptedFormat}`;
        link.click();
        setTimeout(() => URL.revokeObjectURL(link.href), 1_000);
        status.textContent = `NCM 解密完成 (${decryptedFormat.toUpperCase()})，下载已开始。`;
        return;
      }

      status.textContent = `NCM 解密完成，正在本机 FFmpeg 转换为 ${targetFormat.toUpperCase()}…`;
      const mimeTypes = { mp3: "audio/mpeg", flac: "audio/flac" };
      const decryptedBlob = new Blob([ncmResult.audioBuffer], { type: mimeTypes[decryptedFormat] || "application/octet-stream" });
      const tempFile = new File([decryptedBlob], `${baseName}.${decryptedFormat}`, { type: decryptedBlob.type });

      const formData = new FormData();
      formData.append("file", tempFile);
      formData.append("format", targetFormat);

      const response = await fetch("/api/convert", { method: "POST", body: formData });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.message ?? "转码失败。");
      }

      const link = document.createElement("a");
      link.href = URL.createObjectURL(await response.blob());
      const disposition = response.headers.get("content-disposition") ?? "";
      const encodedName = disposition.match(/filename\*=UTF-8''(.+)/)?.[1];
      link.download = encodedName ? decodeURIComponent(encodedName) : `${baseName}.${targetFormat}`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(link.href), 1_000);
      status.textContent = "转换完成，下载已开始。";
      return;
    }

    status.textContent = `正在本机转换 ${file.name}…`;
    const response = await fetch("/api/convert", { method: "POST", body: new FormData(form) });
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error(body.message ?? "转换失败。");
    }

    const link = document.createElement("a");
    link.href = URL.createObjectURL(await response.blob());
    const disposition = response.headers.get("content-disposition") ?? "";
    const encodedName = disposition.match(/filename\*=UTF-8''(.+)/)?.[1];
    link.download = encodedName ? decodeURIComponent(encodedName) : "converted-audio";
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 1_000);
    status.textContent = "转换完成，下载已开始。";
  } catch (error) {
    status.textContent = error.message;
  } finally {
    button.disabled = false;
  }
});
