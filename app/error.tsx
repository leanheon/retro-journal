'use client';
export default function ErrorPage({ reset }: { error: Error; reset: () => void }) {
 return <main className="error-page" id="main"><span className="eyebrow">PLEASE TRY AGAIN</span><div className="error-number">잠시<span>✳</span></div><h1>기록을 펼치지 못했어요.</h1><p>잠시 후 다시 시도해 주세요.</p><button className="button" onClick={reset}>다시 불러오기 ↗</button><a className="text-button" href="/">기록실로 돌아가기</a></main>;
}
