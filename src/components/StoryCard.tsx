import type { Story } from '../types/data'

export default function StoryCard({ story }: { story?: Story }) {
  if (!story) {
    return (
      <article className="card">
        <p className="eyebrow">Atlas of Stories</p>
        <p>No story is attached to this site.</p>
      </article>
    )
  }
  const [first, ...rest] = Array.from(story.paraphrase)
  return (
    <article className="card story" aria-labelledby="story-h">
      <p className="eyebrow">Atlas of Stories</p>
      <h2 id="story-h">{story.title}</h2>
      <p className="byline">{story.author}, {story.year}</p>
      <p className="tale">
        <span className="initial" aria-hidden="true">{first}</span>
        <span className="sr-only">{first}</span>
        {rest.join('')}
      </p>
      <p className="link-note">{story.landscape_link}</p>
      <p className="source">
        {story.source.includes('CITATION_NEEDED') && <span className="chip warn">CITATION_NEEDED</span>}
        Source note: {story.source}
      </p>
    </article>
  )
}