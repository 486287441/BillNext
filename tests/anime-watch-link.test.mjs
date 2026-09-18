import { build } from 'esbuild'
import assert from 'node:assert/strict'
import { test } from 'node:test'

const bundle = await build({ entryPoints: ['src/services/anime-watch-link.ts'], bundle: true, write: false, platform: 'node', format: 'esm' })
const { checkAnimeWatchLink, resolveAnimeWatchLink } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`)
const original = 'https://www.bilibili.com/video/BV1234567890'
const reply = (body, status = 200) => async () => new Response(JSON.stringify(body), { status })

test('有效视频、已删除、风控和网络异常分别处理', async () => {
  assert.equal(await checkAnimeWatchLink(original, reply({ code: 0, data: { bvid: 'BV1234567890' } })), 'available')
  for (const code of [-404, 62002]) assert.equal(await checkAnimeWatchLink(original, reply({ code })), 'missing')
  for (const code of [-403, -352, -101]) assert.equal(await checkAnimeWatchLink(original, reply({ code })), 'unknown')
  assert.equal(await checkAnimeWatchLink(original, async () => { throw Error('offline') }), 'unknown')
  assert.equal(await checkAnimeWatchLink(original, reply({}, 503)), 'unknown')
})

test('正常和无法确认的链接不触发重新匹配', async () => {
  for (const state of ['available', 'unknown']) {
    const result = await resolveAnimeWatchLink(original, '番名', () => assert.fail(), async () => state, async () => assert.fail())
    assert.equal(result.url, original)
    assert.equal(result.replaced, false)
    assert.equal(result.verified, state === 'available')
  }
})

test('失效后排除旧链接和不可用候选，返回经过验证的新链接', async () => {
  const replacement = 'https://www.bilibili.com/video/BV9876543210'
  let notified = false
  const result = await resolveAnimeWatchLink(original, '查询番名', () => { notified = true },
    async (url) => url === replacement ? 'available' : 'missing',
    async (title, accept) => {
      assert.equal(title, '查询番名')
      assert.equal(await accept(original), false)
      assert.equal(await accept('https://www.bilibili.com/video/BV0000000000'), false)
      assert.equal(await accept(replacement), true)
      return { url: replacement }
    })
  assert.equal(notified, true)
  assert.deepEqual(result, { url: replacement, replaced: true, verified: true })
})

test('匹配失败向界面报告错误，不返回未经验证的替代链接', async () => {
  await assert.rejects(resolveAnimeWatchLink(original, '番名', () => {}, async () => 'missing', async () => { throw Error('没有合集') }), /没有合集/)
})

test('不支持的协议被拒绝，普通网页 404 可触发重新匹配', async () => {
  await assert.rejects(checkAnimeWatchLink('javascript:alert(1)'), /http/)
  assert.equal(await checkAnimeWatchLink('https://www.bilibili.com/example', reply({}, 404)), 'missing')
  assert.equal(await checkAnimeWatchLink('https://www.bilibili.com/example', reply({})), 'unknown')
})
