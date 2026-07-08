import type { ReactNode } from "react";
import { Tex, Eqn, Where } from "./Tex";

const R = String.raw;

const SECTIONS = [
  ["setup", "State space"],
  ["noise", "Q and R"],
  ["predict", "Prediction"],
  ["update", "Update"],
  ["why", "Vs. the alternatives"],
] as const;

function Section({
  id,
  num,
  title,
  children,
}: {
  id: string;
  num: number;
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="msection" id={id}>
      <div className="msection-head">
        <span className="msection-num">{num}</span>
        <h2>{title}</h2>
      </div>
      {children}
    </section>
  );
}

export default function MethodologyView() {
  return (
    <div className="view method">
      <p className="view-lede">
        A Kalman filter tracks something you cannot measure directly by combining a model
        of how it moves with noisy measurements of it. Here that hidden thing is either the
        true price level or the true hedge ratio between two stocks. Everything the two
        tabs compute is below, derived in the order the filter actually runs.
      </p>

      <nav className="method-toc">
        {SECTIONS.map(([id, label]) => (
          <a key={id} href={`#${id}`}>
            {label}
          </a>
        ))}
      </nav>

      <Section id="setup" num={1} title="State-space formulation">
        <div className="intuition">
          Two equations. The <b>state equation</b> says how the hidden quantity moves from
          one day to the next. The <b>observation equation</b> says how a price you can see
          relates to the hidden quantity you cannot. Write those two down and the filter
          gives the optimal estimate for free.
        </div>

        <h3>Local level model</h3>
        <p>
          The hidden state is one number: the underlying price level. It drifts as a random
          walk, and each close is that level plus measurement noise.
        </p>
        <Eqn tex={R`\begin{aligned} x_t &= x_{t-1} + w_t, & w_t &\sim \mathcal{N}(0,\, Q) \\[2pt] y_t &= x_t + v_t, & v_t &\sim \mathcal{N}(0,\, R) \end{aligned}`} />
        <Where
          rows={[
            [R`x_t`, "hidden price level at time t, what we want"],
            [R`y_t`, "observed close at time t, what we get"],
            [R`w_t`, "process noise, the random drift of the true level"],
            [R`v_t`, "observation noise, tick and microstructure noise"],
            [R`Q`, "process noise variance"],
            [R`R`, "observation noise variance"],
          ]}
        />
        <p>
          Calling the close a noisy reading of a smoother level is a modeling choice, not a
          fact about markets. It is what turns the vague goal of smoothing into a problem
          with one optimal answer.
        </p>

        <h3>Dynamic hedge ratio model</h3>
        <p>
          Now the hidden state is a vector: the intercept and slope of a regression of one
          leg on the other. Both are allowed to move as a random walk.
        </p>
        <Eqn tex={R`\boldsymbol{\theta}_t = \begin{bmatrix} \alpha_t \\ \beta_t \end{bmatrix}, \qquad \boldsymbol{\theta}_t = \boldsymbol{\theta}_{t-1} + \mathbf{w}_t, \qquad \mathbf{w}_t \sim \mathcal{N}(\mathbf{0},\, \mathbf{Q})`} />
        <Eqn tex={R`y_t = \mathbf{H}_t\, \boldsymbol{\theta}_t + v_t = \begin{bmatrix} 1 & x_t \end{bmatrix} \begin{bmatrix} \alpha_t \\ \beta_t \end{bmatrix} + v_t, \qquad v_t \sim \mathcal{N}(0,\, R)`} />
        <Where
          rows={[
            [R`y_t`, "log price of the dependent leg (ticker Y)"],
            [R`x_t`, "log price of the hedge leg (ticker X)"],
            [R`\alpha_t`, "time-varying intercept of the pair relationship"],
            [R`\beta_t`, "time-varying hedge ratio, the state we care about"],
            [R`\mathbf{H}_t`, "observation row [1, x_t], different every step"],
            [R`\mathbf{Q}`, "2x2 process noise covariance of the coefficients"],
            [R`R`, "variance of the pricing error around the fitted spread"],
          ]}
        />
        <p>
          This is ordinary linear regression with coefficients that are allowed to move.
          The observation row changes every day because it holds the regressor price, and
          that one detail is what makes this a regression filter rather than a smoother.
          Following Ernie Chan, the app sets{" "}
          <Tex tex={R`\mathbf{Q} = \tfrac{\delta}{1-\delta}\,\mathbf{I}`} /> so a single{" "}
          <Tex tex={R`\delta \in (0,1)`} /> controls how fast the hedge ratio may drift.
          Log prices are used so <Tex tex={R`\beta_t`} /> is a ratio of percentage moves.
        </p>
      </Section>

      <Section id="noise" num={2} title="Process noise Q and observation noise R">
        <div className="intuition">
          Q and R are the only knobs, and only their <b>ratio</b> matters. Q is how much you
          think the hidden state can really move between prints. R is how much noise sits on
          each print. The filter spends its whole life trading these two off.
        </div>
        <p>
          High R relative to Q means the filter trusts its own model more than the tape. It
          reads a surprising print as noise, absorbs little of it, and reacts slowly. The
          estimate is smooth but lags. High Q relative to R means the filter believes the
          relationship genuinely moves, so it chases the market: fast to react, at the cost
          of tracking noise it should have ignored.
        </p>
        <p>
          Neither extreme is right. A pair with stable economics, two mega-cap beverage
          names, earns a small Q. A pair crossing a structural break, one leg gets acquired
          or shifts its business, needs a larger Q or the filter hedges with a stale beta.
          The sliders on both tabs move these ratios live, so the smoothness against
          responsiveness tradeoff is something you can watch rather than take on faith.
        </p>
      </Section>

      <Section id="predict" num={3} title="Prediction step">
        <div className="intuition">
          Before looking at today's price, guess where the state went and admit you are now
          less sure. With a random walk the best guess is yesterday's estimate, and the
          uncertainty grows by Q.
        </div>
        <Eqn tex={R`\hat{\boldsymbol{\theta}}_{t \mid t-1} = \hat{\boldsymbol{\theta}}_{t-1 \mid t-1}, \qquad \mathbf{P}_{t \mid t-1} = \mathbf{P}_{t-1 \mid t-1} + \mathbf{Q}`} />
        <Where
          rows={[
            [R`\hat{\boldsymbol{\theta}}_{t \mid t-1}`, "state estimate at t given data through t minus 1 (the prior)"],
            [R`\hat{\boldsymbol{\theta}}_{t-1 \mid t-1}`, "last posterior, the estimate after yesterday's update"],
            [R`\mathbf{P}_{t \mid t-1}`, "predicted covariance, uncertainty before the new print"],
            [R`\mathbf{P}_{t-1 \mid t-1}`, "covariance after the previous update"],
          ]}
        />
        <p>
          In the local level model these collapse to scalars,{" "}
          <Tex tex={R`\hat{x}_{t \mid t-1} = \hat{x}_{t-1 \mid t-1}`} /> and{" "}
          <Tex tex={R`P_{t \mid t-1} = P_{t-1 \mid t-1} + Q`} />. Prediction only ever grows
          uncertainty. Only data shrinks it.
        </p>
      </Section>

      <Section id="update" num={4} title="Update step">
        <div className="intuition">
          The price arrives. Measure how wrong the prediction was (the <b>innovation</b>),
          then correct the estimate by a fraction of that error. The fraction is the{" "}
          <b>Kalman gain</b>, and it is the entire filter in one number.
        </div>
        <p>First the innovation and how surprising it should have been:</p>
        <Eqn tex={R`e_t = y_t - \mathbf{H}_t\, \hat{\boldsymbol{\theta}}_{t \mid t-1}, \qquad S_t = \mathbf{H}_t\, \mathbf{P}_{t \mid t-1}\, \mathbf{H}_t^{\top} + R`} />
        <Where
          rows={[
            [R`e_t`, "innovation, the prediction error on the new print"],
            [R`S_t`, "innovation variance, how surprised the model expected to be"],
          ]}
        />
        <p>Then the gain, and the correction it drives:</p>
        <Eqn tex={R`\mathbf{K}_t = \mathbf{P}_{t \mid t-1}\, \mathbf{H}_t^{\top}\, S_t^{-1}`} />
        <Eqn tex={R`\hat{\boldsymbol{\theta}}_{t \mid t} = \hat{\boldsymbol{\theta}}_{t \mid t-1} + \mathbf{K}_t\, e_t, \qquad \mathbf{P}_{t \mid t} = \left( \mathbf{I} - \mathbf{K}_t \mathbf{H}_t \right) \mathbf{P}_{t \mid t-1}`} />
        <Where
          rows={[
            [R`\mathbf{K}_t`, "Kalman gain, the fraction of the innovation absorbed"],
            [R`\hat{\boldsymbol{\theta}}_{t \mid t}`, "updated (posterior) state estimate"],
            [R`\mathbf{P}_{t \mid t}`, "updated covariance, never larger than the prediction"],
            [R`\mathbf{I}`, "identity matrix"],
          ]}
        />
        <p>
          The gain is large when the prior is uncertain (<Tex tex={R`\mathbf{P}`} /> big) or
          the data is clean (<Tex tex={R`R`} /> small), so the estimate jumps toward the
          print. It is small when the model is confident and the data is noisy, so the print
          is mostly ignored. In the scalar case it is just{" "}
          <Tex tex={R`K_t = P_{t \mid t-1} / (P_{t \mid t-1} + R)`} />, a number between 0
          and 1 deciding how much of each surprise to believe.
        </p>
        <p>
          The standardized innovation <Tex tex={R`z_t = e_t / \sqrt{S_t}`} /> is also the
          trade. If the model holds it is standard-normal white noise, so a reading past
          about <Tex tex={R`\pm 2`} /> means the spread has moved further than noise can
          explain. Short the rich leg, long the cheap leg, and unwind as{" "}
          <Tex tex={R`z_t`} /> reverts to zero.
        </p>
      </Section>

      <Section id="why" num={5} title="Why not a moving average or rolling OLS">
        <div className="intuition">
          A window weights the last <i>N</i> days fully and everything older at zero. The
          filter replaces that hard edge with a probability model, and gets an error bar as
          a bonus.
        </div>
        <div className="compare">
          <div className="compare-card lose">
            <h4>Rolling window</h4>
            <ul>
              <li>Every day inside the window counts equally, everything outside counts nothing.</li>
              <li>Beta jumps when a stale outlier falls off the back edge, pure artifact.</li>
              <li>The lookback length is a free parameter with no principled value.</li>
              <li>Returns a point estimate and no measure of its own reliability.</li>
            </ul>
          </div>
          <div className="compare-card win">
            <h4>Kalman filter</h4>
            <ul>
              <li>Each print is weighted by how informative it is under the noise model.</li>
              <li>Old information decays smoothly through Q, no cliff edge.</li>
              <li>Recursive: needs only the last estimate, runs from the first data point.</li>
              <li>Carries a covariance, so every estimate ships with a confidence band.</li>
            </ul>
          </div>
        </div>
        <p>
          The covariance <Tex tex={R`\mathbf{P}`} /> is the part a moving average can never
          give you. It is the band drawn around the level and the hedge ratio on both tabs,
          and the innovation variance <Tex tex={R`S_t`} /> is what turns a raw residual into
          the tradeable z-score. Under the model's assumptions, linear dynamics and Gaussian
          noise, this is not one option among many. The Kalman filter is the minimum-variance
          estimator, so any window scheme is a special case done worse.
        </p>
      </Section>
    </div>
  );
}
