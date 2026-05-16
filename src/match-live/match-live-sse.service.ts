import { Injectable } from '@nestjs/common';
import { Observable, Subscription } from 'rxjs';
import { map } from 'rxjs/operators';
import { MatchLiveService } from './match-live.service';
import { LiveUpdatePublisherService } from './live-update.publisher.service';

@Injectable()
export class MatchLiveSseService {
  constructor(
    private readonly live: MatchLiveService,
    private readonly publisher: LiveUpdatePublisherService,
  ) {}

  stream(
    matchId: string,
    opts?: { lastSeq?: number },
  ): Observable<MessageEvent> {
    return new Observable((subscriber) => {
      let redisSub: Subscription | undefined;
      void this.live
        .build(matchId)
        .then((snapshot) => {
          subscriber.next({
            data: JSON.stringify({
              type: 'snapshot',
              data: snapshot,
            }),
          } as MessageEvent);

          redisSub = this.publisher.observe(matchId).subscribe({
            next: (msg) => {
              if (opts?.lastSeq != null && msg.seq <= opts.lastSeq) {
                return;
              }
              subscriber.next({
                data: JSON.stringify({
                  type: 'live_patch',
                  matchId: msg.matchId,
                  seq: msg.seq,
                  at: msg.at,
                }),
              } as MessageEvent);
            },
            error: (err) => subscriber.error(err),
          });
        })
        .catch((err) => subscriber.error(err));

      return () => {
        redisSub?.unsubscribe();
      };
    });
  }
}
