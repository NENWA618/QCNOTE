import requests

url = 'https://api.github.com/repos/fghrsh/live2d_demo/git/trees/master?recursive=1'
headers = {'User-Agent': 'py'}
resp = requests.get(url, headers=headers)
resp.raise_for_status()
js = resp.json()
results = [item['path'] for item in js.get('tree', []) if 'koharu' in item['path'] and item['path'].endswith('.json')]
print(results)
