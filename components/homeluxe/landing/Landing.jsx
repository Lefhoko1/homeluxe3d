import React, { useEffect, useMemo, useState } from 'react';

import { getSupabase } from '../../../lib/supabase/client';
import ContactForm from './ContactForm';
import '../homeluxe.css';
import '../visitor.css';
import './landing.css';

/**
 * The company's front door.
 *
 * The showroom used to be the whole site: `/` loaded a 3D house and a visitor
 * arrived INSIDE it, with no idea what they were looking at, who was behind
 * it, or what it would cost a shop to be in it. That is a demo, not a
 * business. This page answers those three questions and then opens the door.
 *
 * THE NUMBERS ARE REAL. `v_platform_summary` counts the actual shops,
 * products and positions -- a front page claiming "500+ products" when the
 * database holds twelve is a lie one click from being found out, and the
 * click is right there. When the platform is small the honest number is the
 * more persuasive one anyway: 112 positions still free is an invitation.
 *
 * ONE CALL TO ACTION PER AUDIENCE, and there are exactly two. Somebody
 * furnishing a home wants to walk through; somebody selling furniture wants
 * to be in it. Every section is written for one of the two and says which.
 */
const Landing = () => {
  const [counts, setCounts] = useState(null);

  useEffect(() => {
    const supabase = getSupabase();
    if (!supabase) return;
    let cancelled = false;
    supabase
      .from('v_platform_summary')
      .select('shops, products, positions, positions_free, rooms')
      .maybeSingle()
      .then(({ data }) => { if (!cancelled) setCounts(data ?? null); });
    return () => { cancelled = true; };
  }, []);

  return (
    <main className="lp">
      <SiteHeader />
      <Hero counts={counts} />
      <HowItWorks />
      <Services />
      <ForShops counts={counts} />
      <About />
      <Contact />
      <SiteFooter />
    </main>
  );
};

const SiteHeader = () => (
  <header className="lp-top">
    <a className="luxe-wordmark" href="/">
      <strong>HomeLuxe 3D</strong>
      <span>Gaborone</span>
    </a>
    <nav className="lp-nav">
      <a href="#how">How it works</a>
      <a href="#services">Services</a>
      <a href="#about">About</a>
      <a href="#contact">Contact</a>
    </nav>
    <div className="lp-top-actions">
      <a className="luxe-btn ghost" href="/following">My shops</a>
      <a className="luxe-btn primary" href="/showroom">Enter the house</a>
    </div>
  </header>
);

/**
 * The hero.
 *
 * The headline says what the thing IS in one sentence, because "immersive
 * 3D experiences" says nothing and could be about anything. A house you walk
 * through, full of furniture you can actually buy, from shops down the road.
 */
const Hero = ({ counts }) => (
  <section className="lp-hero">
    <div className="lp-hero-text">
      <p className="luxe-eyebrow">A virtual furniture showroom</p>
      <h1 className="lp-h1">
        Walk through a house furnished by the shops near you.
      </h1>
      <p className="lp-lede">
        Every bed, tile, tap and coat of paint in the house is a real product
        from a real Gaborone shop, standing where you would actually put it.
        Open a door, walk in, and see the sofa at its own size in a room its
        own size.
      </p>
      <div className="lp-hero-actions">
        <a className="luxe-btn primary lp-btn-lg" href="/showroom">
          Walk through the house
        </a>
        <a className="luxe-btn ghost lp-btn-lg" href="#shops">
          Put your shop in it
        </a>
      </div>

      {counts && (
        <dl className="lp-counts">
          <div><dt>Rooms</dt><dd>{counts.rooms}</dd></div>
          <div><dt>Shops</dt><dd>{counts.shops}</dd></div>
          <div><dt>Products</dt><dd>{counts.products}</dd></div>
          <div>
            <dt>Positions free</dt>
            <dd className="lp-free">{counts.positions_free}</dd>
          </div>
        </dl>
      )}
    </div>

    {/* A drawing of the plan rather than a photograph of the render. The
        house is one click away and will always look better than a still of
        it; this says "there is a real, surveyed building here", which a
        screenshot does not. */}
    <div className="lp-hero-art" aria-hidden="true">
      <PlanSketch />
    </div>
  </section>
);

/**
 * The floor plan, drawn from the real room rectangles.
 *
 * Not decoration and not a stock illustration: these are the actual rooms of
 * the actual house, at their actual proportions, read from the same
 * collision manifest the walk uses. If the plan changes, this changes.
 */
const PlanSketch = () => {
  const [rooms, setRooms] = useState([]);

  useEffect(() => {
    let cancelled = false;
    fetch('/models/house/collision.json')
      .then((r) => r.json())
      .then((data) => { if (!cancelled) setRooms(data.rooms ?? []); })
      .catch(() => {});          // the drawing is a nicety, not the page
    return () => { cancelled = true; };
  }, []);

  const box = useMemo(() => {
    if (!rooms.length) return null;
    const xs = rooms.flatMap((r) => [r.rect[0], r.rect[2]]);
    const zs = rooms.flatMap((r) => [r.rect[1], r.rect[3]]);
    return {
      x0: Math.min(...xs), z0: Math.min(...zs),
      x1: Math.max(...xs), z1: Math.max(...zs),
    };
  }, [rooms]);

  if (!box) return <div className="lp-plan-empty" />;

  const w = box.x1 - box.x0;
  const h = box.z1 - box.z0;

  return (
    <svg
      className="lp-plan"
      viewBox={`${box.x0 - 0.6} ${box.z0 - 0.6} ${w + 1.2} ${h + 1.2}`}
      role="img"
      aria-label="Floor plan of the virtual house"
    >
      {rooms.map((room) => {
        const [x0, z0, x1, z1] = room.rect;
        return (
          <g key={room.room}>
            <rect
              x={x0} y={z0} width={x1 - x0} height={z1 - z0}
              className="lp-plan-room"
            />
            <text
              x={(x0 + x1) / 2} y={(z0 + z1) / 2}
              className="lp-plan-label"
              /* Scaled in user units, so the label stays the same visual size
                 whatever the viewBox works out to. */
              style={{ fontSize: Math.min(0.42, (x1 - x0) / 7) }}
            >
              {room.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
};

const HowItWorks = () => (
  <section className="lp-section" id="how">
    <div className="lp-section-head">
      <p className="luxe-eyebrow">How it works</p>
      <h2 className="lp-h2">Three steps, and none of them are yours.</h2>
      <p className="lp-sub">
        Most shops have photographs and a price list, not 3D models. That is
        the normal case, and it is the one we built the business around.
      </p>
    </div>

    {/* NUMBERED BECAUSE IT IS ACTUALLY A SEQUENCE. Each step depends on the
        one before it, which is the only thing that earns a number. */}
    <ol className="lp-steps">
      <li>
        <span className="lp-step-n">1</span>
        <h3>You send us the product</h3>
        <p>
          Photographs, dimensions and a price. A catalogue page or a
          WhatsApp album is enough. If you already have a model, send that
          instead and we will check it fits.
        </p>
      </li>
      <li>
        <span className="lp-step-n">2</span>
        <h3>We build it</h3>
        <p>
          Modelled to the millimetre from your measurements and textured from
          your photographs, then checked against the size you gave us — a
          model exported in the wrong units never reaches the house.
        </p>
      </li>
      <li>
        <span className="lp-step-n">3</span>
        <h3>It stands in a room</h3>
        <p>
          In a position that suits it: a bed in a bedroom, a tile on a floor,
          a hinge on every door. Visitors walk in, click it, and ask you about
          it — and you answer from your own screen.
        </p>
      </li>
    </ol>
  </section>
);

const SERVICES = [
  {
    title: '3D modelling, done for you',
    body:
      'You will not touch Blender. Send photographs and measurements and we ' +
      'produce the model, the materials and the placement. Most shops never ' +
      'upload anything.',
  },
  {
    title: 'A position in the house',
    body:
      'Not a listing in a grid — a place on a floor, at real scale, in a room ' +
      'a visitor walked into. The house has a fixed number of positions, which ' +
      'is what makes one worth having.',
  },
  {
    title: 'Surfaces as well as furniture',
    body:
      'Paint, tiles, coatings and flooring dress whole rooms rather than ' +
      'standing in them. A visitor asking "what is that floor?" gets your name.',
  },
  {
    title: 'A guided tour that stops at your product',
    body:
      'The house walks itself, room by room, pausing to look at what is ' +
      'advertised. Your product is not waiting to be found.',
  },
  {
    title: 'Followers, and email when you add something',
    body:
      'Visitors follow your shop. Publish a product and they are told — with ' +
      'the photograph, the price and a link straight to it in the house.',
  },
  {
    title: 'Proof it was seen',
    body:
      'Views, clicks and enquiries per product and per day. You are buying ' +
      'attention, so you can see the attention.',
  },
];

const Services = () => (
  <section className="lp-section lp-section-tint" id="services">
    <div className="lp-section-head">
      <p className="luxe-eyebrow">Services</p>
      <h2 className="lp-h2">What you get.</h2>
    </div>
    <div className="lp-services">
      {SERVICES.map((service) => (
        <article key={service.title} className="lp-service">
          <h3>{service.title}</h3>
          <p>{service.body}</p>
        </article>
      ))}
    </div>
  </section>
);

const ForShops = ({ counts }) => (
  <section className="lp-section lp-band" id="shops">
    <div className="lp-band-inner">
      <div>
        <p className="luxe-eyebrow">For shops</p>
        <h2 className="lp-h2">
          {counts
            ? `${counts.positions_free} positions in the house are still empty.`
            : 'There is room in the house.'}
        </h2>
        <p className="lp-sub">
          A position is a place something stands: the floor beside the bed, the
          worktop by the window, the wall of the hallway. There are{' '}
          {counts ? counts.positions : 'a fixed number of'} of them across{' '}
          {counts ? counts.rooms : 'fourteen'} rooms, and when they are taken
          they are taken.
        </p>
        <a className="luxe-btn primary lp-btn-lg" href="#contact">
          Talk to us about a position
        </a>
      </div>
    </div>
  </section>
);

const About = () => (
  <section className="lp-section" id="about">
    <div className="lp-about">
      <div className="lp-section-head">
        <p className="luxe-eyebrow">About us</p>
        <h2 className="lp-h2">Furniture is bought in rooms, not in grids.</h2>
      </div>
      <div className="lp-about-body">
        <p>
          HomeLuxe 3D is a Gaborone company. We build one very good house and
          furnish it with what local shops actually sell, so that somebody
          deciding on a bed can walk into a bedroom and see it at its own size,
          against a wall, beside a wardrobe — instead of judging it from a
          photograph on a white background.
        </p>
        <p>
          The house is surveyed, not sketched. Every room has real dimensions,
          the doors open, the walls stop you, and a bed that would not fit does
          not go in. That constraint is the whole point: a showroom where
          everything fits is a catalogue with better pictures.
        </p>
        <p>
          For the shops we are a production house as much as an advertising
          one. Almost nobody selling sofas in Gaborone has a 3D artist, and
          they should not need one — send photographs and measurements, and the
          modelling is ours.
        </p>
      </div>
    </div>
  </section>
);

const Contact = () => (
  <section className="lp-section lp-section-tint" id="contact">
    <div className="lp-contact">
      <div className="lp-section-head">
        <p className="luxe-eyebrow">Contact us</p>
        <h2 className="lp-h2">Tell us what you sell.</h2>
        <p className="lp-sub">
          Whether you want a position, want us to model something, or just want
          to know what it costs — write and we will answer.
        </p>
        <ul className="lp-contact-details">
          <li>
            <span>Email</span>
            <a href="mailto:hello@homeluxe3d.co.bw">hello@homeluxe3d.co.bw</a>
          </li>
          <li>
            <span>Where</span>
            <span>Gaborone, Botswana</span>
          </li>
        </ul>
      </div>
      <ContactForm />
    </div>
  </section>
);

const SiteFooter = () => (
  <footer className="lp-footer">
    <div className="lp-footer-inner">
      <a className="luxe-wordmark" href="/">
        <strong>HomeLuxe 3D</strong>
        <span>Gaborone</span>
      </a>
      <nav className="lp-footer-nav">
        <a href="/showroom">The house</a>
        <a href="/following">My shops</a>
        <a href="#services">Services</a>
        <a href="#contact">Contact</a>
      </nav>
      <p className="lp-footer-note">
        © {new Date().getFullYear()} HomeLuxe 3D. Prices and stock are the
        shops&apos; own.
      </p>
    </div>
  </footer>
);

export default Landing;
