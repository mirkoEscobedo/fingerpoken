// This file is part of fingerpoken
// Copyright (C) 2015 Jordan Sissel
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as
// published by the Free Software Foundation, either version 3 of the
// License, or (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU Affero General Public License for more details.
//
// You should have received a copy of the GNU Affero General Public License
// along with this program.  If not, see <http://www.gnu.org/licenses/>.
package mdp

import (
	"bytes"
	"fmt"
	// Use my fork until issue #145 is fixed/merged.
	log "github.com/Sirupsen/logrus"
	czmq "github.com/jordansissel/goczmq"
	"time"
)

type Client struct {
	sock      *czmq.Sock
	broker    string
	poller    *czmq.Poller
	destroyed bool

	RetryInterval time.Duration
	RetryCount    int64
	CurveInfo
}

func NewClient(broker string) (c *Client) {
	c = &Client{
		broker:        broker,
		RetryCount:    3,
		RetryInterval: 500 * time.Millisecond,
	}
	return
}

func (c *Client) Send(service string, body [][]byte) (err error) {
	err = c.ensure_connected()
	if err != nil {
		return
	}

	// Since we're using a REQ socket, we use a 3-frame message instead of the 4-frame message a DEALER would use.
	// TODO(sissel): The body can occupy more than 1 frame, let's maybe support that some day?
	var request [2][]byte = [2][]byte{
		mdp_CLIENT,
		//[]byte{byte(c_REQUEST)},
		[]byte(service),
	}

	frames := append(request[:], body...)
	for j, x := range frames {
		log.Printf("Client: frame %d: %v (%s)\n", j, x, string(x))
	}
	err = c.sock.SendMessage(frames)
	if err != nil {
		log.Printf("Client: Error sending message: %s\n", err)
		return
	}
	return
}

func (c *Client) WaitForReply() error {
	s := czmqPollerSafeWait(c.poller, durationInMilliseconds(c.RetryInterval))
	if s == nil {
		// Timeout
		return fmt.Errorf("Timeout waiting for reply")
	}
	return nil
}

func (c *Client) Recv() (response [][]byte, err error) {
	reply, err := c.sock.RecvMessage()
	//for i, x := range reply { log.Printf("Client(via Broker): frame %d: %v (%s)\n", i, x, string(x)) }
	if err != nil {
		log.Printf("Client: Error receiving message: %s\n", err)
		return
	}

	if count := len(reply); count < 3 {
		err = fmt.Errorf("Majordomo protocol problem. A REPLY must be at least 3 frames, got %d frames in a message.", count)
		return
	}

	if !bytes.Equal(reply[0], mdp_CLIENT) {
		err = fmt.Errorf("Majordomo protocol problem. Expected first frame to be `%s`. Got something else.", string(mdp_CLIENT))
		return
	}

	// Should we bother checking the `service` frame (reply[1]) ?
	response = reply[2:]
	return
}

func (c *Client) SendRecv(service string, body [][]byte) (response [][]byte, err error) {
	var got_reply bool
	for i := int64(0); !got_reply && !c.destroyed && i < c.RetryCount; i += 1 {
		err = c.Send(service, body)
		if err != nil {
			return
		}

		err = c.WaitForReply()
		if err == nil {
			got_reply = true
		} else if c.destroyed {
			err = fmt.Errorf("Client was destroyed while waiting for a response")
			return
		} else {
			// timeout
			log.Printf("Client: Timeout on try %d of request to %s service: %s\n", i, service, err)
			if err.Error() == "Timeout waiting for reply" {
				c.reset()
			} else {
				return
			}
		}
	}

	if !got_reply {
		return
	}
	response, err = c.Recv()
	return
}

func (c *Client) Destroy() {
	c.close()
	c.destroyed = true
}

func (c *Client) reset() error {
	c.close()
	return c.ensure_connected()
}

func (c *Client) close() {
	if c.sock != nil {
		c.sock.Destroy()
		c.sock = nil
	}
	if c.poller != nil {
		c.poller.Destroy()
		c.poller = nil
	}
}

func (c *Client) ensure_connected() error {
	if c.sock != nil {
		return nil
	}

	c.sock = newSock(czmq.Req)

	// Setup CURVE if a key is set.
	if len(c.CurveServerPublicKey) > 0 {
		c.sock.SetCurveServerkey(c.CurveServerPublicKey)
	}
	if c.CurveCertificate == nil {
		log.Warn("No CurveCertificate given. Will generate a new one.")
		c.CurveCertificate = czmq.NewCert()
	}
	c.CurveCertificate.Apply(c.sock)

	err := c.sock.Connect(c.broker)
	if err != nil {
		return err
	}

	c.poller, err = czmq.NewPoller(c.sock)
	if err != nil {
		return err
	}
	return nil
}
