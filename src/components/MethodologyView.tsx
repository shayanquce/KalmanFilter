import { Tex, TexBlock, Where } from "./Tex";

const R = String.raw;

export default function MethodologyView() {
  return (
    <div className="view method">
      <p className="view-lede">
        Everything the two tabs compute, derived in order: the state-space setup, what Q
        and R mean for a trader, the prediction step, the update step, and why this is
        worth using over a moving average or a rolling regression.
      </p>

      <h2>1. State-space formulation</h2>
      <p>
        A Kalman filter needs two equations. The state equation says how the hidden
        quantity evolves. The observation equation says how what we can see (a price
        print) relates to what we cannot (the true level, or the true hedge ratio).
      </p>

      <h3>Local level model</h3>
      <p>
        The hidden state is a single number, the underlying price level. It follows a
        random walk, and each close is that level plus measurement noise:
      </p>
      <TexBlock
        tex={R`\begin{aligned} x_t &= x_{t-1} + w_t, \qquad & w_t &\sim \mathcal{N}(0,\, Q) \\ y_t &= x_t + v_t, \qquad & v_t &\sim \mathcal{N}(0,\, R) \end{aligned}`}
      />
      <Where
        rows={[
          [R`x_t`, "hidden price level at time t, the thing we want"],
          [R`y_t`, "observed close at time t, the thing we get"],
          [R`w_t`, "process noise, the random drift of the true level"],
          [R`v_t`, "observation noise, microstructure and idiosyncratic tick noise"],
          [R`Q`, "process noise variance"],
          [R`R`, "observation noise variance"],
        ]}
      />
      <p className="dim">
        Calling the close a noisy measurement of a smoother underlying level is a modeling
        choice, not a physical fact. It is what turns "smooth this series" into a
        well-posed estimation problem with an optimal recursive answer.
      </p>

      <h3>Dynamic hedge ratio model</h3>
      <p>
        For the pair, the observation is one leg's log price, the regressor is the other
        leg's log price, and the hidden state is the regression coefficients themselves.
        Stack the intercept and slope into a state vector that follows a random walk:
      </p>
      <TexBlock
        tex={R`\boldsymbol{\theta}_t = \begin{bmatrix} \alpha_t \\ \beta_t \end{bmatrix}, \qquad \boldsymbol{\theta}_t = \boldsymbol{\theta}_{t-1} + \mathbf{w}_t, \qquad \mathbf{w}_t \sim \mathcal{N}(\mathbf{0},\, \mathbf{Q})`}
      />
      <TexBlock
        tex={R`y_t = \mathbf{H}_t \boldsymbol{\theta}_t + v_t = \begin{bmatrix} 1 & x_t \end{bmatrix} \begin{bmatrix} \alpha_t \\ \beta_t \end{bmatrix} + v_t, \qquad v_t \sim \mathcal{N}(0,\, R)`}
      />
      <Where
        rows={[
          [R`y_t`, "log price of the dependent leg (ticker Y) at time t"],
          [R`x_t`, "log price of the hedge leg (ticker X) at time t"],
          [R`\alpha_t`, "time-varying intercept of the pair relationship"],
          [R`\beta_t`, "time-varying hedge ratio, the state we care about"],
          [R`\mathbf{H}_t`, "observation matrix, here the row vector [1, x_t], different at every step"],
          [R`\mathbf{Q}`, "2 by 2 process noise covariance of the coefficient random walk"],
          [R`R`, "variance of the pricing error around the fitted spread"],
        ]}
      />
      <p>
        This is an ordinary linear regression where the coefficients are allowed to move.
        The observation matrix changes every period because it contains the regressor
        price. That single detail is what makes the filter a regression estimator rather
        than a smoother. Following Ernie Chan's parametrization, the app sets{" "}
        <Tex tex={R`\mathbf{Q} = \frac{\delta}{1 - \delta}\, \mathbf{I}`} /> with a single
        scalar <Tex tex={R`\delta \in (0, 1)`} /> controlling how fast the coefficients
        may drift.
      </p>

      <h2>2. Process noise Q and observation noise R</h2>
      <p>
        Q and R are the only knobs, and everything about the filter's behavior is the
        ratio between them. Q says how much the hidden state can plausibly move between
        two observations. R says how noisy each individual observation is.
      </p>
      <p>
        The trading interpretation is direct. High R relative to Q means the filter trusts
        its own model more than the tape. It treats a surprising print as noise, absorbs
        little of it, and reacts slowly. The estimate is smooth but lags. High Q relative
        to R means the filter believes the underlying relationship really does move, so it
        chases the market. It reacts fast and re-fits the hedge ratio aggressively, at the
        cost of tracking noise it should have ignored.
      </p>
      <p>
        Neither extreme is right. A pair whose economics are stable (two mega-cap
        beverage companies) earns a small Q. A pair spanning a structural break (one leg
        gets acquired, or its business mix shifts) needs a larger Q or the filter will
        hedge with a stale beta. The sliders on both tabs move these ratios live so you
        can watch the smoothness-versus-responsiveness tradeoff directly.
      </p>

      <h2>3. Prediction step</h2>
      <p>
        Before seeing the new observation, project the state and its uncertainty forward.
        With a random-walk state the transition matrix is the identity, so the best guess
        for tomorrow is today's estimate, and the uncertainty grows by Q:
      </p>
      <TexBlock
        tex={R`\hat{\boldsymbol{\theta}}_{t \mid t-1} = \hat{\boldsymbol{\theta}}_{t-1 \mid t-1}, \qquad \mathbf{P}_{t \mid t-1} = \mathbf{P}_{t-1 \mid t-1} + \mathbf{Q}`}
      />
      <Where
        rows={[
          [R`\hat{\boldsymbol{\theta}}_{t \mid t-1}`, "state estimate at t given data through t minus 1 (the prior)"],
          [R`\hat{\boldsymbol{\theta}}_{t-1 \mid t-1}`, "state estimate after the previous update (the last posterior)"],
          [R`\mathbf{P}_{t \mid t-1}`, "predicted state covariance, uncertainty before seeing the new print"],
          [R`\mathbf{P}_{t-1 \mid t-1}`, "state covariance after the previous update"],
        ]}
      />
      <p className="dim">
        In the local level model these are scalars and the same equations read{" "}
        <Tex tex={R`\hat{x}_{t \mid t-1} = \hat{x}_{t-1 \mid t-1}`} /> and{" "}
        <Tex tex={R`P_{t \mid t-1} = P_{t-1 \mid t-1} + Q`} />. Uncertainty only ever grows
        in prediction. Only data shrinks it.
      </p>

      <h2>4. Update step</h2>
      <p>
        The new observation arrives. First compute the innovation, the part of the print
        the model did not predict, and its variance:
      </p>
      <TexBlock
        tex={R`e_t = y_t - \mathbf{H}_t \hat{\boldsymbol{\theta}}_{t \mid t-1}, \qquad S_t = \mathbf{H}_t \mathbf{P}_{t \mid t-1} \mathbf{H}_t^{\top} + R`}
      />
      <Where
        rows={[
          [R`e_t`, "innovation, the prediction error on the new print"],
          [R`S_t`, "innovation variance, how surprised the model expected to be"],
        ]}
      />
      <p>Then form the Kalman gain and fold the innovation into the estimate:</p>
      <TexBlock
        tex={R`\mathbf{K}_t = \mathbf{P}_{t \mid t-1} \mathbf{H}_t^{\top} S_t^{-1}`}
      />
      <TexBlock
        tex={R`\hat{\boldsymbol{\theta}}_{t \mid t} = \hat{\boldsymbol{\theta}}_{t \mid t-1} + \mathbf{K}_t\, e_t, \qquad \mathbf{P}_{t \mid t} = \left( \mathbf{I} - \mathbf{K}_t \mathbf{H}_t \right) \mathbf{P}_{t \mid t-1}`}
      />
      <Where
        rows={[
          [R`\mathbf{K}_t`, "Kalman gain, the fraction of the innovation absorbed into the state"],
          [R`\hat{\boldsymbol{\theta}}_{t \mid t}`, "updated (posterior) state estimate"],
          [R`\mathbf{P}_{t \mid t}`, "updated state covariance, always no larger than the prediction"],
          [R`\mathbf{I}`, "identity matrix"],
        ]}
      />
      <p>
        The gain is the whole story. It is large when the prior is uncertain (P big) or
        the data is clean (R small), so the estimate moves toward the print. It is small
        when the model is confident and the data is noisy, so the print is mostly
        discounted. In the scalar case the gain is literally{" "}
        <Tex tex={R`K_t = P_{t \mid t-1} / (P_{t \mid t-1} + R)`} />, a number between 0
        and 1 deciding how much of each surprise to believe.
      </p>
      <p>
        The standardized innovation <Tex tex={R`z_t = e_t / \sqrt{S_t}`} /> is also the
        trading signal in the pairs tab. If the model is right, it is standard normal
        white noise. A value beyond about 2 says the spread has moved further from the
        model than noise explains, which is the classic stat arb entry condition.
      </p>

      <h2>5. Why not a moving average or rolling OLS</h2>
      <p>
        A moving average or a rolling regression has a window, and the window is a blunt
        instrument. Every observation inside it counts fully and equally, every
        observation outside it counts zero. A 60-day rolling OLS beta jumps when an
        outlier from 61 days ago falls off the back edge, an artifact with no economic
        content. The lookback length is a parameter with no principled answer, and the
        estimator says nothing about its own reliability. It hands you a point estimate
        and no error bars.
      </p>
      <p>
        The Kalman filter replaces the window with a probability model. Each new print is
        weighted by exactly how informative it is under the stated noise assumptions, old
        information decays smoothly through Q rather than falling off a cliff, and the
        recursion needs only the previous estimate and covariance, so it runs in constant
        time per observation and works from the first data point. Most importantly it
        carries its uncertainty with it: the covariance P gives a confidence interval
        around the level or the hedge ratio at every step, and the innovation variance S
        tells you how surprising each print should have been, which is what turns a
        residual into a z-score you can trade. Under the model assumptions (linear
        dynamics, Gaussian noise) this is not just one option among many. The Kalman
        filter is the minimum-variance estimator, so any window-based scheme is a special
        case done worse.
      </p>
    </div>
  );
}
