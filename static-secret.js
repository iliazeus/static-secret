/*
  MIT License

  Copyright (c) 2024 Ilia Pozdnyakov

  Permission is hereby granted, free of charge, to any person obtaining a copy
  of this software and associated documentation files (the "Software"), to deal
  in the Software without restriction, including without limitation the rights
  to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
  copies of the Software, and to permit persons to whom the Software is
  furnished to do so, subject to the following conditions:

  The above copyright notice and this permission notice shall be included in all
  copies or substantial portions of the Software.

  THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
  IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
  FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
  AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
  LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
  OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
  SOFTWARE.
*/

if (import.meta.url) {
  const importUrl = new URL(import.meta.url);
  const importHashQuery = new URLSearchParams(importUrl.hash.slice(1));

  if (importHashQuery.has("decrypt")) {
    const hashQuery = new URLSearchParams(window.location.hash.slice(1));

    const passwordParameter = importHashQuery.get("pwin") ?? "p";
    const password = hashQuery.get(passwordParameter);
    hashQuery.delete(passwordParameter);

    const clearedUrl = new URL(window.location);
    clearedUrl.hash = hashQuery.toString();
    history.replaceState(null, "", clearedUrl);

    window.addEventListener("load", () => {
      decryptElements({ root: document, password });
    });
  }
}

/**
 * @param {string} opts.password
 * @param {HTMLElement} [opts.root]
 * @returns {Promise<void>}
 */
export function decryptElements({ password, root = document }) {
  return new Promise((resolve) => {
    const elements = root.querySelectorAll("[data-static-secret]");

    let elementsProcessed = 0;
    const onElementProcessed = () => {
      elementsProcessed += 1;
      if (elementsProcessed === elements.length) {
        root.dispatchEvent(new Event("decrypted"));
        resolve();
      }
    };

    for (const element of elements) {
      if (
        element instanceof HTMLImageElement ||
        element instanceof HTMLMediaElement ||
        element instanceof HTMLIFrameElement ||
        (element instanceof HTMLScriptElement && element.src)
      ) {
        fetch(element.src)
          .then((response) => decrypt(response, password, element.dataset.staticSecret))
          .then((data) => {
            element.src = URL.createObjectURL(new Blob([data]));
            element.dataset.staticSecretDecrypted = "";
          })
          .catch((error) => console.error(error))
          .finally(onElementProcessed);

        continue;
      }

      if (element instanceof HTMLAnchorElement && element.download !== undefined) {
        fetch(element.href)
          .then((response) => decrypt(response, password, element.dataset.staticSecret))
          .then((data) => {
            element.href = URL.createObjectURL(new Blob([data]));
            element.dataset.staticSecretDecrypted = "";
          })
          .catch((error) => console.error(error))
          .finally(onElementProcessed);

        continue;
      }

      if (element.innerHTML) {
        decrypt(fromBase64(element.innerHTML.trim()), password, element.dataset.staticSecret)
          .then((data) => {
            element.innerHTML = new TextDecoder().decode(data);
            element.dataset.staticSecretDecrypted = "";
            elements.push(...element.querySelectorAll("[data-static-secret]"));
          })
          .catch((error) => console.error(error))
          .finally(onElementProcessed);

        continue;
      }
    }
  });
}

/**
 * @typedef {object} EncryptionParams
 * @property {number} iterations
 * @property {Uint8Array} salt
 * @property {Uint8Array} iv
 */

/**
 * @typedef {object} EncryptedData
 * @property {Uint8Array} bytes
 * @property {string} params
 */

/**
 * @param {Uint8Array | Blob | Response} bytes
 * @param {string} password
 * @param {EncryptionParams | string} params
 * @returns {Promise<Uint8Array>}
 */
export async function decrypt(bytes, password, params) {
  if (typeof params === "string") params = decodeParams(params);
  let { salt, iv, iterations } = params;

  if (bytes instanceof Response || bytes instanceof Blob) {
    bytes = new Uint8Array(await bytes.arrayBuffer());
  }

  const key = await deriveKey(password, { salt, iterations });
  /** @type {ArrayBuffer} */ let result;

  try {
    result = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, bytes);
  } catch (error) {
    throw new DecryptionError(error);
  }

  return new Uint8Array(result);
}

/**
 * @param {Uint8Array | Blob} data
 * @param {string} password
 * @param {number | undefined} [opts.iterations]
 * @returns {EncryptedData}
 */
export async function encrypt(data, password, { iterations = 100000 }) {
  if (data instanceof Blob) {
    data = new Uint8Array(await data.arrayBuffer());
  }

  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));

  const key = await deriveKey(password, { salt, iterations });
  /** @type {ArrayBuffer} */ let result;

  try {
    result = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, data);
  } catch (error) {
    throw new EncryptionError(error);
  }

  return {
    bytes: new Uint8Array(result),
    params: encodeParams({ iterations, salt, iv }),
  };
}

/**
 *
 * @param {string} password
 * @param {Uint8Array} salt
 * @param {number} iterations
 * @returns {Promise<CryptoKey>}
 */
async function deriveKey(password, { salt, iterations }) {
  try {
    const keyMaterial = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(password),
      "PBKDF2",
      false,
      ["deriveKey"]
    );

    return await crypto.subtle.deriveKey(
      // derivation algorithm
      {
        name: "PBKDF2",
        salt,
        hash: "SHA-256",
        iterations,
      },

      // derivation material
      keyMaterial,

      // encryption algoritm
      {
        name: "AES-GCM",
        length: 256,
      },

      // exportable
      false,

      // usages
      ["encrypt", "decrypt"]
    );
  } catch (error) {
    throw new KeyGenerationError(error);
  }
}

/**
 * @param {EncryptionParams} params
 * @returns {string}
 */
function encodeParams(params) {
  const data = new Uint8Array(8 + params.salt.length + params.iv.length);
  const view = new DataView(data.buffer);

  let offset = 0;
  view.setUint32(offset, params.iterations, true);
  offset += 4;
  view.setUint16(offset, params.salt.length, true);
  offset += 2;
  data.set(params.salt, offset);
  offset += params.salt.length;
  view.setUint16(offset, params.iv.length, true);
  offset += 2;
  data.set(params.iv, offset);
  offset += params.iv.length;

  return toBase64(data);
}

/**
 * @param {string} str
 * @returns {EncryptionParams}
 */
function decodeParams(data) {
  data = fromBase64(data);
  const view = new DataView(data.buffer);

  let offset = 0;
  const iterations = view.getUint32(offset, true);
  offset += 4;
  const saltLength = view.getUint16(offset, true);
  offset += 2;
  const salt = data.slice(offset, offset + saltLength);
  offset += saltLength;
  const ivLength = view.getUint16(offset);
  offset += 2;
  const iv = data.slice(offset, offset + ivLength);
  offset += ivLength;

  return { iterations, salt, iv };
}

export class KeyGenerationError extends Error {
  name = KeyGenerationError.name;

  /** @param {Error} cause */
  constructor(cause) {
    super(cause.message);
  }
}

export class EncryptionError extends Error {
  name = EncryptionError.name;

  /** @param {Error} cause */
  constructor(cause) {
    super(cause.message);
  }
}

export class DecryptionError extends Error {
  name = DecryptionError.name;

  /** @param {Error} cause */
  constructor(cause) {
    super(cause.message);
  }
}

/**
 * @param {Uint8Array} bytes
 * @returns {string}
 */
function toBase64(bytes) {
  return btoa(String.fromCharCode(...bytes));
}

/**
 * @param {string} str
 * @returns {Uint8Array}
 */
function fromBase64(str) {
  return Uint8Array.from(atob(str), (c) => c.charCodeAt(0));
}
