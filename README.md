# static-secret.js

`static-secret` is a simple-to-use script for embedding password-encrypted data into web pages.

## Usage

### Encryption

There's a [browser tool].

[browser tool]: https://iliazeus.github.io/static-secret/encrypt.html

### Embedding with auto-decryption

First, reference the script by adding this to your page's HTML:

<!-- prettier-ignore -->
```html
<script type="module" src="https://iliazeus.github.io/static-secret/static-secret.js#decrypt"></script>
```

Save both the encrypted file and the `data-static-secret` value;

Then, embed the encrypted data:

<!-- prettier-ignore -->
```html
embedding images, audios and videos:
<img src="file.png.encrypted" data-static-secret="your-value-here">
<audio src="file.ogg.encrypted" data-static-secret="your-value-here"></audio>
<video src="file.mp4.encrypted" data-static-secret="your-value-here"></video>

embedding downloadable files:
<a download href="file.png.encrypted" data-static-secret="your-value-here">Download!</a>

encrypting the contents themselves:
<div data-static-secret="your-value-here">
base64 encrypted contents here (check the "Get base64-encoded contents" box).
</div>
```

To view encrypted files, you will need the same password that was used for encryption. By default, you pass it via the `#p=` parameter, as in this example:

https://iliazeus.github.io/static-secret/example.html#p=kodak

### Advanced

For advanced usage, consult the [source code].

[source code]: ./static-secret.js
