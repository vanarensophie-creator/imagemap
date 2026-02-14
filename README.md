# Photo Map

Small static site to select photos and show their locations on a world map.

Features
- Select multiple photos from your device
- Reads GPS EXIF (if present) and plots photos on an OpenStreetMap map using Leaflet
- Mobile-friendly and works on iPhone Safari (file picker)

Notes about selection
- There are two selection buttons on the front page: "Choose from Files" and (when running in Safari) "Choose from Photos (Safari)". Use the Photos button on iPhone/Safari to open the native photo picker.
 - The picker now accepts videos as well as images. Videos will show a playable preview and a generated thumbnail from the first frame.
 - Files (images/videos) without GPS can be manually placed on the map: click the "Pin" button under the item, then click the map where you want the marker. Press `Esc` to cancel.

Usage
1. Open the project folder and run a local static server. Example using Python 3:

```bash
python3 -m http.server 8000

# then open http://localhost:8000 in your browser
```

Notes
- Photos without GPS EXIF will be skipped (change behavior in `app.js` if you want manual pinning)
- This is a client-only static site — no server or uploads.

License: MIT (you can change as needed)
# imagemap
# imagemap
# imagemap
