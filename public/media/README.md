# public/media

## screen-loop.mp4

What the televisions in the house are playing.

**Licence: CC0 1.0 (public domain dedication).** Taken from Mozilla's
`interactive-examples` CC0 video samples and copied here deliberately rather
than linked, for two reasons: the picture should not stop working because
somebody else's host stopped answering, and a texture read from another
origin needs that origin's permission every time it is fetched. Served from
this app there is no cross-origin request to refuse.

### Why it is not a YouTube video

Because it cannot be. A YouTube player is a cross-origin `<iframe>`, and the
pixels inside one are not readable by the page that embeds it -- that is the
origin model doing its job. There is no supported way to get a frame out of
it and onto a 3D surface, and the ways that appear to work are extracting the
underlying stream, which is against YouTube's terms and is someone else's
film besides. See `components/homeluxe/products/screens.js`.

The screen will play any ordinary video file. To change what is on it, drop
an `.mp4`, `.webm` or `.m3u8` here and point the product's `texture` at it
(`blender/houseluxe/catalog/shops/bradlows/__init__.py`), or set the
variant's `texture_url` from the admin Products screen.
