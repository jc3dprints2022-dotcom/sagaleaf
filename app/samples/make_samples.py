"""Build PDF and TXT test fixtures from the public-domain Standard Ebooks EPUBs.
All source texts are public domain in the US; Standard Ebooks releases its
editions under CC0."""
import re, zipfile, html, os
from reportlab.lib.pagesizes import A5
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, PageBreak
from reportlab.lib.styles import getSampleStyleSheet

def chapters(epub, limit=None):
    z = zipfile.ZipFile(epub)
    opf = z.read('epub/content.opf').decode('utf-8')
    man = {}
    for tag in re.findall(r'<item\b[^>]*>', opf):
        i = re.search(r'\bid="([^"]+)"', tag); h = re.search(r'\bhref="([^"]+)"', tag)
        if i and h: man[i.group(1)] = h.group(1)
    skip = ('titlepage', 'imprint', 'colophon', 'uncopyright', 'toc', 'halftitle', 'dedication', 'epigraph', 'endnotes', 'loi')
    names = ['epub/' + man[i] for i in re.findall(r'<itemref idref="([^"]+)"', opf) if i in man and not any(k in man[i] for k in skip)]
    out = []
    for n in names[:limit]:
        s = z.read(n).decode('utf-8')
        body = re.search(r'<body[^>]*>(.*)</body>', s, re.S).group(1)
        head = re.search(r'<h[1-3][^>]*>(.*?)</h[1-3]>', body, re.S)
        title = html.unescape(re.sub('<[^>]+>', ' ', head.group(1))).strip() if head else ''
        paras = [html.unescape(re.sub(r'\s+', ' ', re.sub('<[^>]+>', '', p))).strip() for p in re.findall(r'<p[^>]*>(.*?)</p>', body, re.S)]
        out.append((re.sub(r'\s+', ' ', title), [p for p in paras if p]))
    return out

here = os.path.dirname(os.path.abspath(__file__))
books = os.path.join(here, '..', 'public', 'samples')

# TXT: Gutenberg-style header/licence so the cleaner is exercised.
ch = chapters(os.path.join(books, 'the-adventures-of-sherlock-holmes.epub'))
with open(os.path.join(books, 'sherlock-holmes-sample.txt'), 'w', encoding='utf-8') as f:
    f.write('The Project Gutenberg eBook of The Adventures of Sherlock Holmes\n\nTitle: The Adventures of Sherlock Holmes\nAuthor: Arthur Conan Doyle\n\n*** START OF THE PROJECT GUTENBERG EBOOK THE ADVENTURES OF SHERLOCK HOLMES ***\n\n')
    for i, (t, ps) in enumerate(ch[:4]):
        f.write(f'Chapter {i+1}\n\n' + '\n\n'.join(ps) + '\n\n\n')
    f.write('*** END OF THE PROJECT GUTENBERG EBOOK THE ADVENTURES OF SHERLOCK HOLMES ***\n\nSection 1. General Terms of Use ...\n' + 'licence text ' * 400)

# PDF with a real text layer.
ch = chapters(os.path.join(books, 'frankenstein.epub'), 3)
st = getSampleStyleSheet()
doc = SimpleDocTemplate(os.path.join(books, 'frankenstein-letters.pdf'), pagesize=A5, title='Frankenstein (Letters)', author='Mary Shelley')
flow = []
for t, ps in ch:
    flow.append(Paragraph(html.escape(t or 'Letter'), st['Heading2']))
    for p in ps: flow += [Paragraph(html.escape(p), st['BodyText']), Spacer(1, 4)]
    flow.append(PageBreak())
doc.build(flow)
print('ok')
