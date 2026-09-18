import { build } from 'esbuild'
import assert from 'node:assert/strict'
import { test } from 'node:test'

const bundle = await build({ entryPoints: ['src/services/anime-tracking.ts'], bundle: true, write: false, platform: 'node', format: 'esm' })
const { cacheAnimeCover } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`)

test('已缓存封面和空封面不发请求', async () => {
  globalThis.chrome = { runtime: { sendMessage: () => assert.fail('不应请求网络') } }
  assert.equal(await cacheAnimeCover('data:image/webp;base64,YQ=='), 'data:image/webp;base64,YQ==')
  assert.equal(await cacheAnimeCover(''), '')
})

test('旧封面网址通过后台缓存，不请求番剧资料', async () => {
  globalThis.chrome = { runtime: { sendMessage: (message, callback) => {
    assert.deepEqual(message, { type: 'bangumi:cache-cover', url: 'https://lain.bgm.tv/pic/cover/test.jpg' })
    callback({ ok: true, data: 'data:image/webp;base64,YQ==' })
  } } }
  assert.equal(await cacheAnimeCover('http://lain.bgm.tv/pic/cover/test.jpg'), 'data:image/webp;base64,YQ==')
})

test('失败向界面返回原因，保留重试机会', async () => {
  globalThis.chrome = { runtime: { sendMessage: (_, callback) => callback({ ok: false, error: '封面下载失败' }) } }
  await assert.rejects(cacheAnimeCover('https://lain.bgm.tv/test.jpg'), /封面下载失败/)
})
