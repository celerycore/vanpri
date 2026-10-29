"""Reader for the supplied FM2K script table, image records and byte-run/LZ codec.

The four packet types are zero fill, literal, repeated byte and overlapping
back-reference. Palette entries are B,G,R,flags; palette index zero is transparent.
"""
from pathlib import Path
import struct
from PIL import Image

ROOT = Path('.')

def unpack(data):
    result = bytearray()
    pos = 0
    while pos < len(data):
        code = data[pos]; pos += 1
        kind, count = code >> 6, code & 63
        if not count:
            count = data[pos]; pos += 1
            if count:
                count += 63
            else:
                count = int.from_bytes(data[pos:pos+3], 'little') + 319
                pos += 3
        if kind == 0:
            result.extend(bytes(count))
        elif kind == 1:
            result.extend(data[pos:pos+count]); pos += count
        elif kind == 2:
            result.extend(bytes([data[pos]]) * count); pos += 1
        else:
            distance = data[pos]; pos += 1
            if not distance:
                distance = (data[pos]+1)*256; pos += 1
            for _ in range(count):
                result.append(result[-distance])
        if len(result) > 32_000_000:
            raise ValueError('invalid decoded size')
    return bytes(result)

class GameFile:
    def __init__(self, name):
        self.name = name
        self.data = d = (ROOT/name).read_bytes()
        count = struct.unpack_from('<I',d,272)[0]
        self.scripts = []
        for j in range(count):
            off = 276+j*39
            self.scripts.append({'name': d[off:off+32].split(b'\0')[0].decode('cp932',errors='replace'),
                'command': int.from_bytes(d[off+32:off+35],'little'), 'flags': d[off+35:off+39].hex()})
        off = 276+count*39
        count = struct.unpack_from('<I',d,off)[0]; off += 4
        self.commands = [d[i:i+16] for i in range(off,off+count*16,16)]
        off += count*16
        self.images = {}
        count = struct.unpack_from('<I',d,off)[0]; off += 4
        for j in range(count):
            pointer = struct.unpack_from('<I',d,off)[0]; off += 4
            if not pointer: continue
            w,h,flags,size = struct.unpack_from('<4I',d,off); off += 16
            assert 0 < w <= 8192 and 0 < h <= 8192, (name,j,off,w,h,flags,size)
            length = size or (w*h + (1024 if flags & 1 else 0))
            self.images[j] = dict(width=w,height=h,flags=flags,size=size,offset=off,length=length)
            off += length
        self.image_end = off

    def pixels(self,index):
        meta = self.images[index]
        d = self.data[meta['offset']:meta['offset']+meta['length']]
        d = unpack(d) if meta['size'] else d
        expected = meta['width']*meta['height']+(1024 if meta['flags']&1 else 0)
        assert len(d) == expected, (self.name,index,len(d),expected)
        return d

    def image(self,index,palette=None):
        meta = self.images[index]
        d = self.pixels(index)
        if meta['flags'] & 1:
            palette,d = d[:1024],d[1024:]
        if palette is None:
            palette = bytes(v for i in range(256) for v in (i,i,i,0))
        im = Image.frombytes('P',(meta['width'],meta['height']),d)
        im.putpalette(bytes(v for i in range(256) for v in palette[i*4:i*4+3][::-1]))
        im.info['transparency'] = 0
        return im.convert('RGBA')
