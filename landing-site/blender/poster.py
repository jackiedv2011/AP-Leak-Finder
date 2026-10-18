"""First frame of a loop as a transparent WebP: the <video poster>, and the still shown
when the viewer prefers reduced motion.
Run: blender -b --factory-startup --python poster.py -- src=FRAME.png out=FILE.webp [quality=82]"""
import bpy, os, sys
A = dict(a.split('=', 1) for a in sys.argv[sys.argv.index('--') + 1:])
img = bpy.data.images.load(os.path.abspath(A['src']))
sc = bpy.context.scene
sc.view_settings.view_transform = 'Standard'   # frames are already display-referred
ims = sc.render.image_settings
ims.file_format = 'WEBP'
ims.color_mode = 'RGBA'
ims.quality = int(A.get('quality', 82))
img.save_render(os.path.abspath(A['out']), scene=sc)
print('POSTER', A['out'], os.path.getsize(os.path.abspath(A['out'])) // 1024, 'KB')
